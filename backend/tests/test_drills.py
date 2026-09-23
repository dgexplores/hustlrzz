"""T9 spaced-repetition state machine: advance, reset, due filter, isolation."""

import os
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app, get_user  # noqa: E402
from backend import db as dbc  # noqa: E402
from backend.obs import limiter as _limiter  # noqa: E402

USER_A = {"uid": "user-a", "email": "a@example.com", "name": "A", "picture": ""}
USER_B = {"uid": "user-b", "email": "b@example.com", "name": "B", "picture": ""}

SEED = {
    "assessment_attempts": [
        {
            "attempt_id": "att-a1",
            "user_id": "user-a",
            "gap_skills": ["system design", "sql"],
            "strength_skills": ["python"],
            "round_scores": [],
            "created_at": "2026-09-20T10:00:00+00:00",
        },
    ],
    "interview_sessions": [],
    "drill_reviews": [],
}


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
        for row in rows:
            store.setdefault(table, []).append(dict(row))
        return [dict(r) for r in rows]

    def fake_update(table, match, values):
        target = None
        for row in store.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(values)
                target = row
        return dict(target) if target is not None else None

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "get_client", lambda: None)
    monkeypatch.setattr(dbc, "select_where", fake_select)
    monkeypatch.setattr(dbc, "insert", fake_insert)
    monkeypatch.setattr(dbc, "update", fake_update)

    with TestClient(app) as c:
        c._store = store  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


def _review(client, skill: str, result: str):
    return client.post(f"/memory/drills/{quote(skill, safe='')}/review", json={"result": result})


def _skills(client):
    return [d["skill"] for d in client.get("/memory/drills").json()["data"]]


# --- GET /memory/drills: seed + due filter --------------------------------- #
def test_get_drills_seeds_weak_skills_due_immediately(client):
    res = client.get("/memory/drills")
    assert res.status_code == 200
    data = res.json()["data"]
    assert [d["skill"] for d in data] == ["system design", "sql"]
    for item in data:
        assert item["due_in_days"] == 0
        assert item["interval_index"] == 0
        assert item["streak"] == 0
        assert item["drill"]["scenario"] == "behavioral"
        due = datetime.fromisoformat(item["due_at"])
        assert abs((_now() - due).total_seconds()) < 60  # day-0: due now
    assert len(client._store["drill_reviews"]) == 2  # type: ignore[attr-defined]

    client.get("/memory/drills")  # seed is idempotent
    assert len(client._store["drill_reviews"]) == 2  # type: ignore[attr-defined]


def test_due_filter_excludes_future_reviews(client):
    now = _now()
    client._store["drill_reviews"] = [  # type: ignore[attr-defined]
        {"user_id": "user-a", "skill": "sql", "interval_index": 1,
         "due_at": _iso(now - timedelta(days=1)), "last_result": "good", "streak": 1},
        {"user_id": "user-a", "skill": "system design", "interval_index": 2,
         "due_at": _iso(now + timedelta(days=5)), "last_result": "good", "streak": 2},
    ]
    assert _skills(client) == ["sql"]


def test_due_order_most_overdue_first(client):
    now = _now()
    client._store["drill_reviews"] = [  # type: ignore[attr-defined]
        {"user_id": "user-a", "skill": "sql", "interval_index": 0,
         "due_at": _iso(now - timedelta(hours=2)), "streak": 0},
        {"user_id": "user-a", "skill": "system design", "interval_index": 0,
         "due_at": _iso(now - timedelta(days=3)), "streak": 0},
    ]
    assert _skills(client) == ["system design", "sql"]


# --- POST review: advance --------------------------------------------------- #
def test_good_advances_interval_and_drill_leaves_due_list(client):
    client.get("/memory/drills")  # seed day-0

    res = _review(client, "sql", "good")
    assert res.status_code == 200
    row = res.json()["data"]
    assert row["skill"] == "sql"
    assert row["interval_index"] == 1
    assert row["streak"] == 1
    assert row["last_result"] == "good"
    delta = datetime.fromisoformat(row["due_at"]) - _now()
    assert timedelta(days=3) - timedelta(hours=1) < delta < timedelta(days=3) + timedelta(hours=1)

    skills = _skills(client)
    assert "sql" not in skills  # complete → disappears until due
    assert "system design" in skills


def test_good_ladder_caps_at_14_days(client):
    client._store["drill_reviews"].append({  # type: ignore[attr-defined]
        "user_id": "user-a", "skill": "sql", "interval_index": 3,
        "due_at": _iso(_now() - timedelta(days=2)),
        "last_result": "good", "streak": 5,
    })
    res = _review(client, "sql", "good")
    assert res.status_code == 200
    row = res.json()["data"]
    assert row["interval_index"] == 3  # capped
    assert row["streak"] == 6
    delta = datetime.fromisoformat(row["due_at"]) - _now()
    assert timedelta(days=14) - timedelta(hours=1) < delta < timedelta(days=14) + timedelta(hours=1)


# --- POST review: reset ----------------------------------------------------- #
def test_again_resets_index_and_due_tomorrow(client):
    client.get("/memory/drills")  # seed day-0
    for row in client._store["drill_reviews"]:  # type: ignore[attr-defined]
        if row["skill"] == "system design":
            row.update({
                "interval_index": 2, "streak": 4,
                "due_at": _iso(_now() - timedelta(days=7)),
            })

    res = _review(client, "system design", "again")
    assert res.status_code == 200
    row = res.json()["data"]
    assert row["interval_index"] == 0
    assert row["streak"] == 0
    assert row["last_result"] == "again"
    delta = datetime.fromisoformat(row["due_at"]) - _now()
    assert timedelta(hours=23) < delta < timedelta(days=1) + timedelta(hours=1)  # due in 1 day

    # again → due sooner (1 day), gone from the due list until tomorrow
    skills = _skills(client)
    assert "system design" not in skills
    assert "sql" in skills  # still day-0 due


# --- POST review: ownership / validation ----------------------------------- #
def test_owner_isolation_between_users(client):
    now = _now()
    client._store["drill_reviews"] = [  # type: ignore[attr-defined]
        {"user_id": "user-a", "skill": "sql", "interval_index": 0,
         "due_at": _iso(now - timedelta(days=1)), "streak": 0, "last_result": None},
        # Tracked + future-due: ensure() skips it, due filter excludes it.
        {"user_id": "user-a", "skill": "system design", "interval_index": 1,
         "due_at": _iso(now + timedelta(days=3)), "streak": 1, "last_result": "good"},
        {"user_id": "user-b", "skill": "leadership", "interval_index": 0,
         "due_at": _iso(now - timedelta(days=1)), "streak": 0, "last_result": None},
    ]
    assert _skills(client) == ["sql"]  # never sees user-b's row

    res = _review(client, "leadership", "good")
    assert res.status_code == 404  # not tracked for user-a, not in a's digest
    b_row = next(r for r in client._store["drill_reviews"] if r["skill"] == "leadership")  # type: ignore[attr-defined]
    assert b_row["interval_index"] == 0
    assert b_row["last_result"] is None  # untouched

    app.dependency_overrides[get_user] = lambda: USER_B
    assert _skills(client) == ["leadership"]
    res_b = _review(client, "leadership", "good")
    assert res_b.status_code == 200
    assert res_b.json()["data"]["interval_index"] == 1
    app.dependency_overrides[get_user] = lambda: USER_A


def test_unknown_skill_review_returns_404(client):
    client.get("/memory/drills")
    before = len(client._store["drill_reviews"])  # type: ignore[attr-defined]
    res = _review(client, "quantum frisbee", "good")
    assert res.status_code == 404
    assert len(client._store["drill_reviews"]) == before  # type: ignore[attr-defined]


def test_review_weak_skill_not_yet_seeded_still_allowed(client):
    """Upsert allowed for skills in the weakness digest even without a row."""
    res = _review(client, "sql", "good")
    assert res.status_code == 200
    row = res.json()["data"]
    assert row["interval_index"] == 1
    assert row["streak"] == 1
    assert [r["skill"] for r in client._store["drill_reviews"]] == ["sql"]  # type: ignore[attr-defined]


def test_invalid_result_returns_422(client):
    client.get("/memory/drills")
    assert _review(client, "sql", "maybe").status_code == 422


def test_requires_auth(client):
    app.dependency_overrides.clear()
    assert client.get("/memory/drills").status_code == 401
    assert _review(client, "sql", "good").status_code == 401
    app.dependency_overrides[get_user] = lambda: USER_A
