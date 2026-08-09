"""Production-oriented RAG ingestion and retrieval service.

All storage and retrieval are explicitly scoped by user ID, even when the
server uses Supabase's service-role connection. This is defense in depth.
"""

from __future__ import annotations

import asyncio
import hashlib
import secrets
from dataclasses import dataclass
from typing import Any

from backend import config, db as dbc
from backend.rag.chunking import chunk_text


class RAGUnavailable(RuntimeError):
    """Raised when configured services cannot support semantic retrieval."""


ALLOWED_SOURCE_TYPES = frozenset({"resume", "portfolio", "notes", "session_report"})


@dataclass(frozen=True)
class RetrievedChunk:
    content: str
    source_title: str
    source_type: str
    document_id: str
    similarity: float


def is_ready() -> bool:
    return bool(config.GEMINI_API_KEY and dbc.is_ready())


def _require_ready() -> None:
    if not config.GEMINI_API_KEY:
        raise RAGUnavailable("Knowledge search is not configured. Set GEMINI_API_KEY for embeddings.")
    if not dbc.is_ready():
        raise RAGUnavailable("Knowledge search storage is not configured.")


def _embed(text: str, task_type: str) -> list[float]:
    """Create one embedding. Kept behind a small seam for deterministic tests."""
    import google.generativeai as genai

    genai.configure(api_key=config.GEMINI_API_KEY)
    response = genai.embed_content(
        model=config.RAG_EMBEDDING_MODEL,
        content=text,
        task_type=task_type,
        output_dimensionality=config.RAG_EMBEDDING_DIMENSIONS,
    )
    embedding = response.get("embedding") if isinstance(response, dict) else None
    if not isinstance(embedding, list) or len(embedding) != config.RAG_EMBEDDING_DIMENSIONS:
        raise RAGUnavailable("Embedding provider returned an invalid vector.")
    return embedding


async def _embed_many(texts: list[str], task_type: str) -> list[list[float]]:
    # The provider call is blocking. Keep it off the event loop and avoid a
    # burst that would make rate limiting more likely.
    results: list[list[float]] = []
    for text in texts:
        results.append(await asyncio.to_thread(_embed, text, task_type))
    return results


async def ingest_document(*, user_id: str, title: str, source_type: str, content: str) -> dict[str, Any]:
    _require_ready()
    normalized = (content or "").strip()
    clean_title = (title or "").strip()
    if not clean_title:
        raise ValueError("Knowledge source needs a title.")
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise ValueError("Knowledge source type is not supported.")
    if len(normalized) < config.MIN_RESUME_TEXT_LENGTH:
        raise ValueError("Knowledge source must contain enough readable text.")
    if len(normalized) > config.RAG_MAX_DOCUMENT_CHARS:
        raise ValueError("Knowledge source is too large.")

    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    existing = dbc.select_where("knowledge_documents", {"content_hash": digest})
    owned = [doc for doc in existing if doc.get("user_id") == user_id]
    if owned:
        return {"document_id": owned[0]["document_id"], "chunk_count": owned[0].get("chunk_count", 0), "duplicate": True}

    chunks = chunk_text(normalized, chunk_size=config.RAG_CHUNK_CHARS, overlap=config.RAG_CHUNK_OVERLAP)
    if not chunks:
        raise ValueError("Knowledge source did not produce searchable content.")
    embeddings = await _embed_many(chunks, "retrieval_document")
    document_id = secrets.token_urlsafe(18)
    dbc.insert("knowledge_documents", [{
        "document_id": document_id,
        "user_id": user_id,
                "title": clean_title[:200],
        "source_type": source_type,
        "content_hash": digest,
        "chunk_count": len(chunks),
    }])
    try:
        dbc.insert("knowledge_chunks", [{
            "document_id": document_id,
            "user_id": user_id,
            "chunk_index": index,
            "content": chunk,
            "embedding": embedding,
        } for index, (chunk, embedding) in enumerate(zip(chunks, embeddings))])
    except Exception:
        # The document row is harmless without chunks, but deleting it prevents
        # a partial write from being mistaken for a successfully indexed source.
        dbc.delete_where("knowledge_documents", {"document_id": document_id})
        raise
    return {"document_id": document_id, "chunk_count": len(chunks), "duplicate": False}


async def retrieve(*, user_id: str, query: str, top_k: int | None = None) -> list[RetrievedChunk]:
    _require_ready()
    clean_query = (query or "").strip()
    if not clean_query:
        return []
    embedding = await asyncio.to_thread(_embed, clean_query[:4000], "retrieval_query")
    count = max(1, min(top_k or config.RAG_TOP_K, 10))
    client = dbc.get_client()
    response = client.rpc("match_knowledge_chunks", {
        "query_embedding": embedding,
        "match_user_id": user_id,
        "match_count": count,
    }).execute()
    seen: set[str] = set()
    results: list[RetrievedChunk] = []
    for row in response.data or []:
        content = str(row.get("content", "")).strip()
        if not content or content in seen:
            continue
        seen.add(content)
        results.append(RetrievedChunk(
            content=content,
            source_title=str(row.get("source_title", "Untitled source")),
            source_type=str(row.get("source_type", "note")),
            document_id=str(row.get("document_id", "")),
            similarity=float(row.get("similarity", 0.0)),
        ))
    return results


def format_context(chunks: list[RetrievedChunk], *, max_chars: int = 6000) -> str:
    """Create bounded, source-labelled prompt context without hiding provenance."""
    parts: list[str] = []
    used = 0
    for chunk in chunks:
        part = f"[Source: {chunk.source_title} ({chunk.source_type})]\n{chunk.content}"
        if used + len(part) > max_chars:
            break
        parts.append(part)
        used += len(part)
    return "\n\n".join(parts)
