import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app, get_user  # noqa: E402
from backend import db as dbc  # noqa: E402
from backend.obs import limiter as _limiter  # noqa: E402

USER_A = {"uid": "user-a", "email": "a@example.com", "name": "A", "picture": ""}
USER_B = {"uid": "user-b", "email": "b@example.com", "name": "B", "picture": ""}

SEED = {
    "interview_sessions": [
        {
            "session_id": "sess-a1",
            "user_id": "user-a",
            "workflow_id": "wf-a1",
            "transcript": [
                {"from": "interviewer", "text": "Explain CAP theorem."},
                {"from": "candidate", "text": "Consistency, availability, partition tolerance."},
            ],
            "report": {"scores": {"communication": 85}, "summary": "Solid answer."},
            "is_audio": False,
            "duration_seconds": 600,
            "created_at": "2026-09-23T12:00:00+00:00",
        },
        {
            "session_id": "sess-b1",
            "user_id": "user-b",
            "workflow_id": "wf-b1",
            "transcript": [],
            "report": {},
            "is_audio": True,
            "duration_seconds": 300,
            "created_at": "2026-09-23T12:30:00+00:00",
        },
    ],
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

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "select_where", fake_select)

    with TestClient(app) as c:
        c._store = store  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


# --- GET /interviews/{session_id}: owner ---------------------------------- #

def test_get_session_owner_returns_full_row(client):
    res = client.get("/interviews/sess-a1")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    data = body["data"]
    assert data["session_id"] == "sess-a1"
    assert data["user_id"] == "user-a"
    assert data["transcript"][0]["text"].startswith("Explain CAP")
    assert data["report"]["scores"]["communication"] == 85
    assert data["duration_seconds"] == 600


# --- GET /interviews/{session_id}: ownership ------------------------------ #

def test_get_session_foreign_returns_404(client):
    """Foreign id must be indistinguishable from unknown (no existence leak)."""
    assert client.get("/interviews/sess-b1").status_code == 404


def test_get_session_unknown_returns_404(client):
    assert client.get("/interviews/does-not-exist").status_code == 404


def test_get_session_requires_auth(client):
    app.dependency_overrides.clear()
    assert client.get("/interviews/sess-a1").status_code == 401
    app.dependency_overrides[get_user] = lambda: USER_A


# --- list route unaffected ------------------------------------------------- #

def test_list_interviews_still_owner_scoped(client):
    res = client.get("/interviews")
    assert res.status_code == 200
    assert [s["session_id"] for s in res.json()["data"]] == ["sess-a1"]
