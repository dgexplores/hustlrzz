import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app, get_user  # noqa: E402
from backend import db as dbc  # noqa: E402
from backend.obs import limiter as _limiter  # noqa: E402

USER_A = {"uid": "user-a", "email": "a@example.com", "name": "A", "picture": ""}

ALLOWED = [
    "prepare_started",
    "prepare_completed",
    "interview_completed",
    "feedback_submitted",
]

SEED = {
    "product_events": [],
    "interview_sessions": [
        {"session_id": "s1", "user_id": "user-a", "report": {"summary": "done"}},
        {"session_id": "s2", "user_id": "user-a", "report": {"summary": "done"}},
        {"session_id": "s3", "user_id": "user-b", "report": {"summary": "done"}},
        {"session_id": "s4", "user_id": "user-b", "report": {}},
    ],
    "report_feedback": [],
}


@pytest.fixture()
def client(monkeypatch):
    app.dependency_overrides[get_user] = lambda: USER_A
    _limiter._events.clear()

    store = {table: [dict(r) for r in rows] for table, rows in SEED.items()}

    def fake_select(table, match=None, order=None):
        rows = store.get(table, [])
        out = [r for r in rows if all(r.get(k) == v for k, v in (match or {}).items())]
        if order:
            out.sort(key=lambda r: str(r.get(order, "")), reverse=True)
        return [dict(r) for r in out]

    def fake_insert(table, rows):
        inserted = []
        for incoming in rows:
            row = {"id": str(len(store.get(table, [])) + 1), **dict(incoming)}
            store.setdefault(table, []).append(row)
            inserted.append(dict(row))
        return inserted

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "get_client", lambda: None)
    monkeypatch.setattr(dbc, "select_where", fake_select)
    monkeypatch.setattr(dbc, "insert", fake_insert)

    with TestClient(app) as c:
        c._store = store  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


def _post(client, body):
    return client.post("/analytics/events", json=body)


# --- POST /analytics/events: allowlist ------------------------------------- #
def test_all_allowed_event_names_accepted(client):
    for name in ALLOWED:
        res = _post(client, {"event_name": name})
        assert res.status_code == 200, res.text
        row = res.json()["data"]
        assert row["event_name"] == name
        assert row["user_id"] == "user-a"
        assert row["occurred_at"]
        assert row["props"] == {}

    stored = client._store["product_events"]  # type: ignore[attr-defined]
    assert [r["event_name"] for r in stored] == ALLOWED


def test_unknown_event_name_rejected_422(client):
    res = _post(client, {"event_name": "page_viewed"})
    assert res.status_code == 422
    assert client._store["product_events"] == []  # type: ignore[attr-defined]


# --- POST /analytics/events: no free text in props -------------------------- #
def test_props_string_value_rejected_422(client):
    res = _post(client, {"event_name": "prepare_started", "props": {"note": "my resume text"}})
    assert res.status_code == 422
    assert client._store["product_events"] == []  # type: ignore[attr-defined]


def test_props_nested_values_rejected_422(client):
    assert _post(client, {"event_name": "prepare_started", "props": {"list": [1, 2]}}).status_code == 422
    assert _post(client, {"event_name": "prepare_started", "props": {"obj": {"a": 1}}}).status_code == 422
    assert client._store["product_events"] == []  # type: ignore[attr-defined]


def test_props_free_text_key_rejected_422(client):
    res = _post(client, {"event_name": "prepare_started", "props": {"free text here": 1}})
    assert res.status_code == 422


def test_non_string_primitive_props_stored_with_no_free_text(client):
    res = _post(client, {
        "event_name": "interview_completed",
        "props": {"duration_seconds": 42, "audio": True, "skipped": None, "score": 4.5},
    })
    assert res.status_code == 200
    stored = client._store["product_events"][0]  # type: ignore[attr-defined]
    assert stored["props"] == {"duration_seconds": 42, "audio": True, "skipped": None, "score": 4.5}
    assert all(v is None or isinstance(v, (bool, int, float)) for v in stored["props"].values())


def test_extra_top_level_body_keys_stripped(client):
    res = _post(client, {
        "event_name": "prepare_completed",
        "resume_text": "should never persist",
    })
    assert res.status_code == 200
    stored = client._store["product_events"][0]  # type: ignore[attr-defined]
    assert "resume_text" not in stored
    assert set(stored) <= {"id", "event_name", "user_id", "occurred_at", "props"}


# --- POST /analytics/events: auth + rate limit ------------------------------ #
def test_requires_auth(client):
    app.dependency_overrides.clear()
    assert _post(client, {"event_name": "prepare_started"}).status_code == 401
    app.dependency_overrides[get_user] = lambda: USER_A


def test_rate_limited_returns_429_with_retry_after(client):
    from backend import config

    for _ in range(config.RATE_ANALYTICS_PER_MIN):
        assert _post(client, {"event_name": "prepare_started"}).status_code == 200

    res = _post(client, {"event_name": "prepare_started"})
    assert res.status_code == 429
    assert res.headers.get("Retry-After")


# --- GET /analytics/summary ------------------------------------------------- #
def test_summary_requires_auth(client):
    app.dependency_overrides.clear()
    assert client.get("/analytics/summary").status_code == 401
    app.dependency_overrides[get_user] = lambda: USER_A


def test_summary_empty_store_returns_nulls_and_zero_counts(client):
    client._store["product_events"] = []  # type: ignore[attr-defined]
    client._store["report_feedback"] = []  # type: ignore[attr-defined]
    client._store["interview_sessions"] = []  # type: ignore[attr-defined]

    res = client.get("/analytics/summary")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["prep_completion_pct"] is None
    assert data["interview_completion_pct"] is None
    assert data["avg_rating"] is None
    assert all(value == 0 for value in data["counts"].values())
    assert "formulas" in data["meta"]
    assert "scope" in data["meta"]


def test_summary_math_with_seeded_fixtures(client):
    store = client._store  # type: ignore[attr-defined]
    store["product_events"] = [
        {"event_name": "prepare_started", "user_id": "user-a", "props": {}},
        {"event_name": "prepare_started", "user_id": "user-b", "props": {}},
        {"event_name": "prepare_started", "user_id": "user-b", "props": {}},
        {"event_name": "prepare_completed", "user_id": "user-a", "props": {}},
        {"event_name": "prepare_completed", "user_id": "user-b", "props": {}},
        {"event_name": "interview_completed", "user_id": "user-a", "props": {}},
        {"event_name": "feedback_submitted", "user_id": "user-a", "props": {}},
    ]
    store["report_feedback"] = [
        {"user_id": "user-a", "session_id": "s1", "rating": 5},
        {"user_id": "user-a", "session_id": "s2", "rating": 4},
        {"user_id": "user-b", "session_id": "s3", "rating": 1},
    ]

    res = client.get("/analytics/summary")
    assert res.status_code == 200
    data = res.json()["data"]
    assert data["prep_completion_pct"] == 66.7  # 2 / 3
    assert data["interview_completion_pct"] == 75.0  # 3 with report / 4 entered
    assert data["avg_rating"] == 3.33  # (5 + 4 + 1) / 3
    assert data["counts"] == {
        "prepare_started": 3,
        "prepare_completed": 2,
        "interview_completed_events": 1,
        "feedback_submitted_events": 1,
        "interviews_entered": 4,
        "interviews_with_report": 3,
        "feedback_count": 3,
    }


def test_summary_no_sessions_means_null_interview_pct(client):
    client._store["interview_sessions"] = []  # type: ignore[attr-defined]

    res = client.get("/analytics/summary")
    data = res.json()["data"]
    assert data["interview_completion_pct"] is None
    assert data["counts"]["interviews_entered"] == 0
