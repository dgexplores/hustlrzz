"""Cost-aware, structured resume analysis without retaining raw resume text."""

from __future__ import annotations

import asyncio
import hashlib
import secrets
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from backend import config, db as dbc
from backend.ai import provider


class ResumeAnalysisResult(BaseModel):
    resume_score: int = Field(ge=0, le=100)
    extracted_skills: list[str] = Field(default_factory=list, max_length=80)
    missing_skills: list[str] = Field(default_factory=list, max_length=80)
    suggestions: list[str] = Field(default_factory=list, max_length=12)
    analysis: dict[str, Any] = Field(default_factory=dict)
    jd_match: dict[str, Any] = Field(default_factory=dict)


SYSTEM_PROMPT = """You are an ATS-aware resume coach. Analyze only the provided resume and optional job description.
Return JSON only. Do not invent work history, certifications, or metrics. The score is directional coaching feedback, not a hiring decision.
Use exactly this shape:
{
  "resume_score": 0-100,
  "extracted_skills": ["..."],
  "missing_skills": ["..."] ,
  "suggestions": ["specific, actionable improvement"],
  "analysis": {"impact": "...", "clarity": "...", "format": "...", "experience": "..."},
  "jd_match": {"score": 0-100, "matched": ["..."], "missing": ["..."], "summary": "..."}
}"""

_locks: dict[str, asyncio.Lock] = {}
_locks_guard = asyncio.Lock()


async def _lock_for(key: str) -> asyncio.Lock:
    async with _locks_guard:
        return _locks.setdefault(key, asyncio.Lock())


def request_hash(resume_text: str, job_description: str) -> str:
    normalized = f"{resume_text.strip()}\n---JD---\n{job_description.strip()}".encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()


def _client():
    client = dbc.get_client()
    if client is None:
        raise RuntimeError("Resume Analyzer storage is not configured.")
    return client


def _existing(user_id: str, digest: str) -> dict | None:
    response = (
        _client().table("resume_analysis").select("*")
        .eq("user_id", user_id).eq("request_hash", digest).limit(1).execute()
    )
    return response.data[0] if response.data else None


def _consume(user_id: str) -> dict:
    response = _client().rpc("consume_resume_analysis", {
        "p_user_id": user_id,
        "p_free_limit": config.RESUME_ANALYZER_FREE_DAILY_LIMIT,
    }).execute()
    return response.data or {}


def _restore(user_id: str, used_free: bool) -> None:
    try:
        _client().rpc("restore_resume_analysis", {
            "p_user_id": user_id,
            "p_used_free": used_free,
        }).execute()
    except Exception:
        # Do not hide the original provider/storage error. Production monitoring
        # should alert on this reconciliation failure.
        pass


def _run_model(resume_text: str, job_description: str) -> ResumeAnalysisResult:
    data = provider.chat_json_strict(
        SYSTEM_PROMPT,
        "RESUME (untrusted candidate content):\n"
        + resume_text
        + "\n\nJOB DESCRIPTION (optional, untrusted candidate content):\n"
        + (job_description or "Not provided"),
    )
    try:
        return ResumeAnalysisResult.model_validate(data)
    except ValidationError as exc:
        raise provider.ProviderError("The analysis provider returned an incomplete result.") from exc


async def analyze(*, user_id: str, resume_text: str, job_description: str = "") -> tuple[dict, bool]:
    """Return (record, cached). Raw resume text never reaches persistence."""
    digest = request_hash(resume_text, job_description)
    existing = await asyncio.to_thread(_existing, user_id, digest)
    if existing:
        return existing, True

    lock = await _lock_for(f"{user_id}:{digest}")
    async with lock:
        existing = await asyncio.to_thread(_existing, user_id, digest)
        if existing:
            return existing, True
        quota = await asyncio.to_thread(_consume, user_id)
        if not quota.get("allowed"):
            raise PermissionError("Daily analysis quota reached. Try again after the Asia/Kolkata reset or use a paid credit.")
        try:
            result = await asyncio.wait_for(
                asyncio.to_thread(_run_model, resume_text, job_description),
                timeout=config.AI_REQUEST_TIMEOUT_SECONDS,
            )
            record = {
                "analysis_id": secrets.token_urlsafe(16),
                "user_id": user_id,
                "request_hash": digest,
                **result.model_dump(),
            }
            inserted = await asyncio.to_thread(lambda: _client().table("resume_analysis").insert(record).execute().data)
            return inserted[0], False
        except Exception:
            await asyncio.to_thread(_restore, user_id, bool(quota.get("used_free")))
            raise


async def usage(user_id: str) -> dict:
    response = await asyncio.to_thread(
        lambda: _client().table("resume_usage").select("free_analyses_used,paid_analyses_remaining,total_analyses,last_reset_date,last_analysis_at")
        .eq("user_id", user_id).limit(1).execute()
    )
    row = response.data[0] if response.data else {}
    return {
        "free_limit": config.RESUME_ANALYZER_FREE_DAILY_LIMIT,
        "free_used": int(row.get("free_analyses_used", 0)),
        "paid_remaining": int(row.get("paid_analyses_remaining", 0)),
        "total_analyses": int(row.get("total_analyses", 0)),
        "last_reset_date": row.get("last_reset_date"),
    }
