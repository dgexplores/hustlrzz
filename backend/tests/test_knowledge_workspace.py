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

SEED = [
    {
        "document_id": "doc-a1",
        "user_id": "user-a",
        "title": "Resume",
        "source_type": "resume",
        "chunk_count": 3,
        "created_at": "2026-09-23T10:00:00+00:00",
        "content_hash": "h1",
    },
    {
        "document_id": "doc-b1",
        "user_id": "user-b",
        "title": "B Notes",
        "source_type": "notes",
        "chunk_count": 2,
        "created_at": "2026-09-23T11:00:00+00:00",
        "content_hash": "h2",
    },
]


@pytest.fixture()
def client(monkeypatch):
    app.dependency_overrides[get_user] = lambda: USER_A
    _limiter._events.clear()

    store = {"knowledge_documents": [dict(r) for r in SEED], "knowledge_chunks": []}

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
    monkeypatch.setattr(dbc, "select_where", fake_select)
    monkeypatch.setattr(dbc, "delete_where", fake_delete)
    # Delete path requires full RAG readiness (embeddings + DB) per architecture.
    from backend.rag import service as rag_service

    monkeypatch.setattr(rag_service, "_require_ready", lambda: None)

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    _limiter._events.clear()


def test_list_documents_owner_scoped(client):
    res = client.get("/knowledge/documents")
    assert res.status_code == 200
    body = res.json()
    assert body["success"] is True
    docs = body["data"]
    assert [d["document_id"] for d in docs] == ["doc-a1"]
    assert set(docs[0]) == {"document_id", "title", "source_type", "chunk_count", "created_at"}


def test_delete_document_returns_204_and_removes_row(client):
    res = client.delete("/knowledge/documents/doc-a1")
    assert res.status_code == 204
    assert res.content == b""

    listing = client.get("/knowledge/documents").json()["data"]
    assert listing == []


def test_delete_foreign_document_returns_404(client):
    res = client.delete("/knowledge/documents/doc-b1")
    assert res.status_code == 404

    # Foreign row untouched; own row still present.
    docs = client.get("/knowledge/documents").json()["data"]
    assert [d["document_id"] for d in docs] == ["doc-a1"]


def test_delete_missing_document_returns_404(client):
    res = client.delete("/knowledge/documents/does-not-exist")
    assert res.status_code == 404


def test_delete_twice_returns_404(client):
    assert client.delete("/knowledge/documents/doc-a1").status_code == 204
    assert client.delete("/knowledge/documents/doc-a1").status_code == 404
