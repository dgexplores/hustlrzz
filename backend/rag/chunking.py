"""Deterministic, dependency-free chunking for resumes and coaching material."""

from __future__ import annotations

import re


def chunk_text(text: str, *, chunk_size: int, overlap: int) -> list[str]:
    """Split prose on paragraph/sentence boundaries without emitting tiny chunks."""
    cleaned = re.sub(r"\r\n?", "\n", text or "").strip()
    if not cleaned:
        return []
    if chunk_size < 100 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("invalid chunking configuration")

    units = [u.strip() for u in re.split(r"\n\s*\n|(?<=[.!?])\s+", cleaned) if u.strip()]
    chunks: list[str] = []
    current = ""
    for unit in units:
        if len(unit) > chunk_size:
            words = unit.split()
            unit_parts: list[str] = []
            part = ""
            for word in words:
                candidate = f"{part} {word}".strip()
                if part and len(candidate) > chunk_size:
                    unit_parts.append(part)
                    part = word
                else:
                    part = candidate
            if part:
                unit_parts.append(part)
        else:
            unit_parts = [unit]

        for part in unit_parts:
            candidate = f"{current}\n\n{part}".strip()
            if current and len(candidate) > chunk_size:
                chunks.append(current)
                tail = current[-overlap:].lstrip() if overlap else ""
                current = f"{tail}\n\n{part}".strip()
            else:
                current = candidate
    if current:
        chunks.append(current)
    return chunks
