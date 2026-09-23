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
    "workflows": [
        {"workflow_id": "wf-a1", "user_id": "user-a", "title": "Pack A", "created_at": "2026-09-23T10:00:00+00:00"},
        {"workflow_id": "wf-b1", "user_id": "user-b", "title": "Pack B", "created_at": "2026-09-23T11:00:00+00:00"},
    ],
    "interview_sessions": [
        {"session_id": "sess-a1", "user_id": "user-a", "workflow_id": "wf-a1", "created_at": "2026-09-23T12:00:00+00:00"},
        {"session_id": "sess-b1", "user_id": "user-b", "workflow_id": "wf-b1", "created_at": "2026-09-23T12:30:00+00:00"},
    ],
    "resume_analysis": [
        {"analysis_id": "an-a1", "user_id": "user-a", "created_at": "2026-09-23T13:00:00+00:00"},
        {"analysis_id": "an-b1", "user_id": "user-b", "created_at": "2026-09-23T13:30:00+00:00"},
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

    def fake_delete(table, match):
        store[table] = [
            r for r in store.get(table, [])
            if not all(r.get(k) == v for k, v in match.items())
        ]

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "get_client", lambda: None)
    monkeypatch.setattr(dbc, "select_where", fake_select)
    monkeypatch.setattr(dbc, "delete_where", fake_delete)

    with TestClient(app) as c:
        c._store = store  # type: ignore[attr-defined]
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


# --- DELETE /workflows/{workflow_id} ------------------------------------- #

def test_delete_workflow_owner_returns_204(client):
    res = client.delete("/workflows/wf-a1")
    assert res.status_code == 204
    assert res.content == b""

    listing = client.get("/workflows").json()["data"]
    assert listing == []


def test_delete_workflow_foreign_returns_404(client):
    res = client.delete("/workflows/wf-b1")
    assert res.status_code == 404

    listing = client.get("/workflows").json()["data"]
    assert [w["workflow_id"] for w in listing] == ["wf-a1"]


def test_delete_workflow_missing_returns_404(client):
    res = client.delete("/workflows/does-not-exist")
    assert res.status_code == 404


def test_delete_workflow_twice_returns_404(client):
    assert client.delete("/workflows/wf-a1").status_code == 204
    assert client.delete("/workflows/wf-a1").status_code == 404


def test_delete_workflow_does_not_cascade_sessions(client):
    """Architecture T2: sessions keep workflow_id and remain readable."""
    assert client.delete("/workflows/wf-a1").status_code == 204

    sessions = client.get("/interviews").json()["data"]
    assert [s["session_id"] for s in sessions] == ["sess-a1"]
    assert sessions[0]["workflow_id"] == "wf-a1"


# --- DELETE /interviews/{session_id} ------------------------------------- #

def test_delete_session_owner_returns_204(client):
    res = client.delete("/interviews/sess-a1")
    assert res.status_code == 204
    assert res.content == b""

    listing = client.get("/interviews").json()["data"]
    assert listing == []


def test_delete_session_foreign_returns_404(client):
    res = client.delete("/interviews/sess-b1")
    assert res.status_code == 404

    listing = client.get("/interviews").json()["data"]
    assert [s["session_id"] for s in listing] == ["sess-a1"]


def test_delete_session_missing_returns_404(client):
    res = client.delete("/interviews/does-not-exist")
    assert res.status_code == 404


def test_delete_session_twice_returns_404(client):
    assert client.delete("/interviews/sess-a1").status_code == 204
    assert client.delete("/interviews/sess-a1").status_code == 404


# --- DELETE /resume-analyzer/analyses/{analysis_id} ---------------------- #

def test_delete_analysis_owner_returns_204(client):
    res = client.delete("/resume-analyzer/analyses/an-a1")
    assert res.status_code == 204
    assert res.content == b""

    # Row gone from store (list endpoint uses client.table; assert via store).
    assert all(r["analysis_id"] != "an-a1" for r in client._store["resume_analysis"])  # type: ignore[attr-defined]


def test_delete_analysis_foreign_returns_404(client):
    res = client.delete("/resume-analyzer/analyses/an-b1")
    assert res.status_code == 404

    store = client._store  # type: ignore[attr-defined]
    assert any(r["analysis_id"] == "an-b1" for r in store["resume_analysis"])
    assert any(r["analysis_id"] == "an-a1" for r in store["resume_analysis"])


def test_delete_analysis_missing_returns_404(client):
    res = client.delete("/resume-analyzer/analyses/does-not-exist")
    assert res.status_code == 404


def test_delete_analysis_twice_returns_404(client):
    assert client.delete("/resume-analyzer/analyses/an-a1").status_code == 204
    assert client.delete("/resume-analyzer/analyses/an-a1").status_code == 404


# --- rate limit (shared "delete" scope) ------------------------------------ #

def test_delete_rate_limited_returns_429_with_retry_after(client):
    from backend import config

    for _ in range(config.RATE_DELETE_PER_MIN):
        assert client.delete("/workflows/does-not-exist").status_code == 404

    res = client.delete("/workflows/does-not-exist")
    assert res.status_code == 429
    assert res.headers.get("Retry-After")
