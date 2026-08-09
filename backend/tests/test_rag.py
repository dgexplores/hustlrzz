import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from backend.rag import service
from backend.rag.chunking import chunk_text


def test_chunk_text_preserves_all_content_and_bounds_chunks():
    text = "First paragraph has useful context.\n\nSecond paragraph explains the project.\n\nThird paragraph gives the result."
    chunks = chunk_text(text, chunk_size=100, overlap=20)
    assert len(chunks) >= 2
    assert all(len(chunk) <= 122 for chunk in chunks)  # overlap may expand the final boundary slightly
    assert "First paragraph" in chunks[0]
    assert any("Third paragraph" in chunk for chunk in chunks)


def test_chunk_text_rejects_invalid_settings():
    try:
        chunk_text("A useful sentence." * 20, chunk_size=100, overlap=100)
    except ValueError as exc:
        assert "invalid chunking" in str(exc)
    else:
        raise AssertionError("Expected invalid chunking configuration to fail")


def test_format_context_adds_citations_and_obeys_limit():
    chunks = [
        service.RetrievedChunk("Python project ownership", "Resume", "resume", "doc-1", 0.91),
        service.RetrievedChunk("Designed a payment API", "Portfolio", "portfolio", "doc-2", 0.83),
    ]
    context = service.format_context(chunks, max_chars=1000)
    assert "[Source: Resume (resume)]" in context
    assert "payment API" in context
    assert service.format_context(chunks, max_chars=20) == ""


def test_ingest_document_deduplicates_per_user(monkeypatch):
    monkeypatch.setattr(service, "_require_ready", lambda: None)
    monkeypatch.setattr(service.dbc, "select_where", lambda table, match: [{
        "document_id": "existing", "user_id": "user-a", "chunk_count": 4,
    }])

    result = asyncio.run(service.ingest_document(
        user_id="user-a", title="Resume", source_type="resume", content="x" * 150,
    ))
    assert result == {"document_id": "existing", "chunk_count": 4, "duplicate": True}


def test_ingest_document_writes_document_and_chunks(monkeypatch):
    writes = []
    monkeypatch.setattr(service, "_require_ready", lambda: None)
    monkeypatch.setattr(service.dbc, "select_where", lambda table, match: [])
    monkeypatch.setattr(service, "_embed_many", lambda chunks, task: asyncio.sleep(0, result=[[0.0] * 768 for _ in chunks]))
    monkeypatch.setattr(service.dbc, "insert", lambda table, rows: writes.append((table, rows)) or rows)

    result = asyncio.run(service.ingest_document(
        user_id="user-a", title="Portfolio", source_type="portfolio", content=("Built a reliable API. " * 20),
    ))
    assert result["duplicate"] is False
    assert [table for table, _ in writes] == ["knowledge_documents", "knowledge_chunks"]
    assert all(row["user_id"] == "user-a" for row in writes[1][1])


def test_ingest_document_removes_parent_when_chunk_write_fails(monkeypatch):
    deleted = []
    monkeypatch.setattr(service, "_require_ready", lambda: None)
    monkeypatch.setattr(service.dbc, "select_where", lambda table, match: [])
    monkeypatch.setattr(service, "_embed_many", lambda chunks, task: asyncio.sleep(0, result=[[0.0] * 768 for _ in chunks]))

    def insert(table, rows):
        if table == "knowledge_chunks":
            raise RuntimeError("database unavailable")
        return rows

    monkeypatch.setattr(service.dbc, "insert", insert)
    monkeypatch.setattr(service.dbc, "delete_where", lambda table, match: deleted.append((table, match)))

    try:
        asyncio.run(service.ingest_document(
            user_id="user-a", title="Notes", source_type="notes", content="Useful context. " * 20,
        ))
    except RuntimeError:
        pass
    else:
        raise AssertionError("Expected chunk storage failure to surface")
    assert deleted and deleted[0][0] == "knowledge_documents"


def test_ingest_document_rejects_untrusted_source_type(monkeypatch):
    monkeypatch.setattr(service, "_require_ready", lambda: None)
    try:
        asyncio.run(service.ingest_document(
            user_id="user-a", title="Notes", source_type="external_url", content="Useful context. " * 20,
        ))
    except ValueError as exc:
        assert "not supported" in str(exc)
    else:
        raise AssertionError("Expected invalid source type to fail")


def test_retrieve_scopes_query_to_current_user(monkeypatch):
    class Response:
        data = [{
            "document_id": "doc-a", "source_title": "Resume", "source_type": "resume",
            "content": "Built a FastAPI application.", "similarity": 0.88,
        }]

    class Rpc:
        def execute(self): return Response()

    class Client:
        def rpc(self, function, args):
            assert function == "match_knowledge_chunks"
            assert args["match_user_id"] == "user-a"
            assert args["match_count"] == 3
            return Rpc()

    monkeypatch.setattr(service, "_require_ready", lambda: None)
    monkeypatch.setattr(service, "_embed", lambda text, task: [0.0] * 768)
    monkeypatch.setattr(service.dbc, "get_client", lambda: Client())
    chunks = asyncio.run(service.retrieve(user_id="user-a", query="Tell me about FastAPI", top_k=3))
    assert len(chunks) == 1
    assert chunks[0].source_title == "Resume"
