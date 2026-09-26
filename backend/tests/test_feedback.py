import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app, get_user  # noqa: E402
import backend.app as app_module  # noqa: E402
from backend import db as dbc  # noqa: E402
from backend.obs import limiter as _limiter  # noqa: E402

USER_A = {"uid": "user-a", "email": "a@example.com", "name": "A", "picture": ""}
USER_B = {"uid": "user-b", "email": "b@example.com", "name": "B", "picture": ""}

SEED = {
    "interview_sessions": [
        {"session_id": "sess-a1", "user_id": "user-a", "workflow_id": "wf-a1"},
        {"session_id": "sess-b1", "user_id": "user-b", "workflow_id": "wf-b1"},
    ],
    "practice_sessions": [
        {"session_id": "practice-a1", "user_id": "user-a"},
        {"session_id": "practice-b1", "user_id": "user-b"},
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

    def fake_upsert(table, rows, on_conflict):
        for incoming in rows:
            key = incoming[on_conflict]
            replaced = False
            for index, existing in enumerate(store.get(table, [])):
                if existing.get(on_conflict) == key:
                    store[table][index] = {**existing, **incoming}
                    replaced = True
                    break
            if not replaced:
                store.setdefault(table, []).append(dict(incoming))
        return [dict(r) for r in store.get(table, [])]

    def fake_insert(table, rows):
        store.setdefault(table, []).extend(dict(row) for row in rows)
        return [dict(row) for row in rows]

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "get_client", lambda: None)
    monkeypatch.setattr(dbc, "select_where", fake_select)
    monkeypatch.setattr(dbc, "upsert", fake_upsert)
    monkeypatch.setattr(dbc, "insert", fake_insert)

    with TestClient(app) as c:
        c._store = store  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


def _post(client, body):
    return client.post("/feedback", json=body)


# --- POST /feedback: create ------------------------------------------------ #
def test_create_feedback_returns_200_with_row(client):
    res = _post(client, {"session_id": "sess-a1", "rating": 5, "comment": "Great drill"})
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    assert body["data"]["session_id"] == "sess-a1"
    assert body["data"]["user_id"] == "user-a"
    assert body["data"]["rating"] == 5
    assert body["data"]["comment"] == "Great drill"

    assert len(client._store["report_feedback"]) == 1  # type: ignore[attr-defined]


def test_create_feedback_comment_optional(client):
    res = _post(client, {"session_id": "sess-a1", "rating": 3})
    assert res.status_code == 200
    assert res.json()["data"]["comment"] is None


# --- POST /feedback: upsert (orchestrator T4 decision) --------------------- #
def test_second_post_upserts_single_row(client):
    first = _post(client, {"session_id": "sess-a1", "rating": 5})
    assert first.status_code == 200

    second = _post(client, {"session_id": "sess-a1", "rating": 2, "comment": "changed my mind"})
    assert second.status_code == 200  # 200 with updated row, never 409
    assert second.json()["data"]["rating"] == 2
    assert second.json()["data"]["comment"] == "changed my mind"

    rows = client._store["report_feedback"]  # type: ignore[attr-defined]
    assert len(rows) == 1
    assert rows[0]["rating"] == 2


# --- POST /feedback: ownership -------------------------------------------- #
def test_foreign_session_returns_404_and_inserts_nothing(client):
    res = _post(client, {"session_id": "sess-b1", "rating": 5})
    assert res.status_code == 404
    assert client._store["report_feedback"] == []  # type: ignore[attr-defined]


def test_unknown_session_returns_404(client):
    res = _post(client, {"session_id": "sess-missing", "rating": 4})
    assert res.status_code == 404
    assert client._store["report_feedback"] == []  # type: ignore[attr-defined]


def test_practice_session_id_accepted(client):
    res = _post(client, {"session_id": "practice-a1", "rating": 4})
    assert res.status_code == 200
    assert res.json()["data"]["session_id"] == "practice-a1"


def test_unissued_practice_session_returns_404(client):
    res = _post(client, {"session_id": "practice-client-generated", "rating": 4})
    assert res.status_code == 404
    assert client._store["report_feedback"] == []  # type: ignore[attr-defined]


def test_foreign_practice_session_returns_404(client):
    res = _post(client, {"session_id": "practice-b1", "rating": 4})
    assert res.status_code == 404
    assert client._store["report_feedback"] == []  # type: ignore[attr-defined]


def test_coaching_practice_issues_owner_bound_session(client, monkeypatch):
    monkeypatch.setattr(
        app_module.analysis,
        "evaluate_coaching_practice",
        lambda **_: {"overall_score": 80, "summary": "Good practice"},
    )

    res = client.post(
        "/coaching/practice",
        json={
            "scenario": "behavioral interview",
            "prompt": "Tell me about a difficult project.",
            "answer": "Candidate: I led a difficult project and shipped it.",
            "presence_metrics": {},
        },
    )

    assert res.status_code == 200
    session_id = res.json()["data"]["session_id"]
    assert session_id.startswith("practice-")
    rows = client._store["practice_sessions"]  # type: ignore[attr-defined]
    assert {"session_id": session_id, "user_id": "user-a"} in rows


def test_requires_auth(client):
    app.dependency_overrides.clear()
    res = _post(client, {"session_id": "sess-a1", "rating": 5})
    assert res.status_code == 401
    app.dependency_overrides[get_user] = lambda: USER_A


# --- POST /feedback: validation ------------------------------------------- #
def test_rating_out_of_range_returns_422(client):
    assert _post(client, {"session_id": "sess-a1", "rating": 0}).status_code == 422
    assert _post(client, {"session_id": "sess-a1", "rating": 6}).status_code == 422
    assert client._store["report_feedback"] == []  # type: ignore[attr-defined]


def test_comment_too_long_returns_422(client):
    res = _post(client, {"session_id": "sess-a1", "rating": 5, "comment": "x" * 1001})
    assert res.status_code == 422


# --- POST /feedback: rate limit ------------------------------------------- #
def test_rate_limited_returns_429_with_retry_after(client):
    from backend import config

    for _ in range(config.RATE_FEEDBACK_PER_MIN):
        assert _post(client, {"session_id": "sess-a1", "rating": 5}).status_code == 200

    res = _post(client, {"session_id": "sess-a1", "rating": 5})
    assert res.status_code == 429
    assert res.headers.get("Retry-After")


# --- GET /feedback/summary ------------------------------------------------- #
def test_summary_empty_owner_average(client):
    res = client.get("/feedback/summary")
    assert res.status_code == 200
    assert res.json()["data"] == {"average": None, "count": 0}


def test_summary_average_counts_only_caller_rows(client):
    store = client._store  # type: ignore[attr-defined]
    store["report_feedback"] = [
        {"id": "1", "user_id": "user-a", "session_id": "sess-a1", "rating": 4, "comment": None},
        {"id": "2", "user_id": "user-a", "session_id": "sess-a2", "rating": 5, "comment": None},
        {"id": "3", "user_id": "user-b", "session_id": "sess-b1", "rating": 1, "comment": None},
    ]

    res = client.get("/feedback/summary")
    assert res.status_code == 200
    assert res.json()["data"] == {"average": 4.5, "count": 2}


def test_summary_after_create_and_upsert(client):
    _post(client, {"session_id": "sess-a1", "rating": 5})
    _post(client, {"session_id": "sess-a1", "rating": 3})  # upsert: still one row

    res = client.get("/feedback/summary")
    assert res.json()["data"] == {"average": 3.0, "count": 1}
