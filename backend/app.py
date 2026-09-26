"""FastAPI app entrypoint for Hustlrzz.

English-native AI mock interview coach. Merges:
  - hustlrzz       (prep workflow, live WebSocket interviewer, judge)
  - interview-skills (company profiles, JD-vs-resume, salary negotiation, modes)
  - AI-Interview-Coach (Next.js shell consumed by frontend)
  - v3: auto-refreshing company intelligence, assessment rounds, humanized
    live interviews, rate limiting, session hygiene.
"""

from __future__ import annotations

import asyncio
import secrets
import time
import zipfile
import math
from io import BytesIO
from pathlib import Path
from typing import Any, Literal, Optional
from xml.etree import ElementTree
import re

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

from backend import config, db as dbc
from backend.ai import provider
from backend.career import analysis, company_profiles
from backend.career import intelligence as company_intel
from backend.rag import service as rag
from backend.resume import service as resume_analyzer
from backend.session import registry
from backend.workflow.preparation import run_preparation_workflow
from backend.obs import get_logger, limiter

log = get_logger("hustlrzz.app")


def _init_sentry() -> None:
    """No-op unless SENTRY_DSN is configured. sentry-sdk auto-instruments
    FastAPI/Starlette once initialized, so no middleware is needed here."""
    if not config.SENTRY_DSN:
        return
    import sentry_sdk

    sentry_sdk.init(dsn=config.SENTRY_DSN, environment=config.ENVIRONMENT, traces_sample_rate=0.1)


_init_sentry()

app = FastAPI(title="Hustlrzz", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=config.CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
    )
    response.headers.setdefault(
        "Content-Security-Policy", "frame-ancestors 'none'; default-src 'none'"
    )
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    return response

bearer = HTTPBearer(auto_error=False)
router = APIRouter()


def _db_or_503():
    if not dbc.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Backend not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )


def rate_limited(scope: str, limit: int, window_seconds: int):
    """Per-user sliding-window request guard bound to an authenticated user.

    Uses the shared Postgres limiter when Supabase is ready (multi-instance
    safe); falls back to in-process counters otherwise.
    """

    async def dependency(request: Request, user: dict = Depends(get_user)) -> dict:
        allowed, retry_after = await limiter.allow_async(
            f"{scope}:{user['uid']}", limit, window_seconds
        )
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="You are moving faster than we can coach. Please wait a moment and try again.",
                headers={"Retry-After": str(retry_after)},
            )
        return user

    return dependency


def get_user(request: Request, credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    client = dbc.get_client()
    if client is None:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        user = client.auth.get_user(credentials.credentials).user
        meta = user.user_metadata or {}
        return {
            "uid": user.id,
            "email": user.email or "",
            "name": meta.get("full_name") or meta.get("name") or "",
            "picture": meta.get("avatar_url") or meta.get("picture") or "",
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def _delete_owned_or_404(table: str, id_col: str, row_id: str, user_id: str, detail: str) -> Response:
    """Owner-only delete: load owned row first, then delete by id + user_id."""
    rows = await asyncio.to_thread(
        dbc.select_where, table, {id_col: row_id, "user_id": user_id}
    )
    if not rows:
        raise HTTPException(status_code=404, detail=detail)
    await asyncio.to_thread(
        dbc.delete_where, table, {id_col: row_id, "user_id": user_id}
    )
    return Response(status_code=204)


@router.get("/workflows")
async def list_workflows(user: dict = Depends(get_user)):
    _db_or_503()
    rows = await asyncio.to_thread(dbc.select_where, "workflows", {"user_id": user["uid"]}, order="created_at")
    return {"success": True, "data": rows}


@router.delete("/workflows/{workflow_id}")
async def delete_workflow(
    workflow_id: str,
    user: dict = Depends(rate_limited("delete", config.RATE_DELETE_PER_MIN, 60)),
):
    """Owner-only. Deletes the workflow row only; interview sessions keep their workflow_id (no cascade)."""
    _db_or_503()
    return await _delete_owned_or_404(
        "workflows", "workflow_id", workflow_id, user["uid"], "Workflow not found."
    )


@router.get("/interviews")
async def list_interviews(user: dict = Depends(get_user)):
    _db_or_503()
    rows = await asyncio.to_thread(
        dbc.select_where, "interview_sessions", {"user_id": user["uid"]}, order="created_at"
    )
    return {"success": True, "data": rows}


@router.get("/interviews/{session_id}")
async def get_interview(session_id: str, user: dict = Depends(get_user)):
    """Owner-only session detail (T7). Unknown and foreign ids both 404 — no existence oracle."""
    _db_or_503()
    rows = await asyncio.to_thread(
        dbc.select_where,
        "interview_sessions",
        {"session_id": session_id, "user_id": user["uid"]},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Session not found.")
    return {"success": True, "data": rows[0]}


@router.delete("/interviews/{session_id}")
async def delete_interview(
    session_id: str,
    user: dict = Depends(rate_limited("delete", config.RATE_DELETE_PER_MIN, 60)),
):
    """Owner-only delete of an interview session row."""
    _db_or_503()
    return await _delete_owned_or_404(
        "interview_sessions", "session_id", session_id, user["uid"], "Session not found."
    )


@router.get("/health")
def health():
    return {
        "status": "ok",
        "version": app.version,
        "ai_configured": provider.is_configured(),
        "provider": config.AI_PROVIDER,
        "db_ready": dbc.is_ready(),
    }


@router.get("/interview/personas")
def list_personas():
    from backend.agents.interviewer import PERSONAS

    return {"success": True, "data": [{"id": k, **v} for k, v in PERSONAS.items()]}


# --------------------------------------------------------------------------- #
# Preparation workflow (resume + JD -> questions + match + salary + modes)
# --------------------------------------------------------------------------- #
@router.post("/workflows/start")
async def start_workflow(
    resume_text: str = Form(...),
    job_description: str = Form(...),
    company_name: str = Form(""),
    linkedin_link: str = Form(""),
    github_link: str = Form(""),
    portfolio_link: str = Form(""),
    additional_info: str = Form(""),
    num_questions: int = Form(config.DEFAULT_QUESTION_COUNT),
    user: dict = Depends(rate_limited("workflows", config.RATE_WORKFLOWS_PER_MIN, 60)),
):
    num_questions = max(1, min(num_questions, 50))
    t0 = time.time()
    rag_status = {"available": rag.is_ready(), "indexed": False}
    # Indexing is additive. An embedding outage must never prevent a candidate
    # from preparing for an interview with the configured chat provider.
    if rag_status["available"]:
        try:
            indexed = await rag.ingest_document(
                user_id=user["uid"],
                title="Resume context",
                source_type="resume",
                content=resume_text,
            )
            rag_status.update(indexed)
            rag_status["indexed"] = True
        except (ValueError, rag.RAGUnavailable) as exc:
            rag_status["warning"] = str(exc)
        except Exception:
            rag_status["warning"] = "Resume knowledge indexing is temporarily unavailable."
    result = await run_preparation_workflow(
        user_id=user["uid"],
        resume_text=resume_text,
        job_description=job_description,
        company_name=company_name,
        linkedin_link=linkedin_link,
        github_link=github_link,
        portfolio_link=portfolio_link,
        additional_info=additional_info,
        num_questions=num_questions,
    )

    # Company intelligence: cached when fresh, auto-researched when stale.
    job_title_for_intel = job_description.split("\n")[0].strip()[:80]
    try:
        intel = await company_intel.ensure_fresh(company_name, role=job_title_for_intel)
    except Exception as exc:
        log.warning("company intel unavailable: %s", exc)
        intel = {
            "status": "fallback",
            "company": company_name,
            "fetched_at": "",
            "confidence": "low",
            "data": company_intel._fallback_data(company_name),
        }
    result["company_intelligence"] = intel

    # Feed the condensed intelligence into this candidate's knowledge base so
    # live follow-ups stay grounded in how the company actually hires.
    if rag.is_ready() and intel.get("status") in {"live", "cached"} and company_name.strip():
        try:
            await rag.ingest_document(
                user_id=user["uid"],
                title=f"Company intelligence: {company_name.strip()[:150]}",
                source_type="company_intelligence",
                content=company_intel.to_knowledge_text(company_name, intel.get("data") or {}),
            )
        except Exception as exc:
            log.info("intel RAG ingest skipped: %s", exc)

    # Kick off a background refresh so the shared cache stays current without
    # making this request wait.
    if intel.get("status") == "live":
        company_intel.start_background_refresh(company_name, job_title_for_intel)

    result["processing_time"] = round(time.time() - t0, 2)
    result["knowledge"] = rag_status
    if not result.get("success"):
        err = str(result.get("error", "Workflow failed"))
        # Surface provider quota limits as a retryable 429, not a 500.
        if provider.is_rate_limit_error(Exception(err)):
            raise HTTPException(status_code=429, detail=err)
        raise HTTPException(status_code=500, detail=err)
    # Persist workflow record (if db ready).
    if dbc.is_ready():
        try:
            persisted_match = {
                **(result.get("company_match") or {}),
                "company_research": result.get("company_research") or {},
            }
            await asyncio.to_thread(
                dbc.insert,
                "workflows",
                [{
                    "workflow_id": result["workflow_id"],
                    "user_id": user["uid"],
                    "title": (result.get("company_match") or {}).get("summary", job_description[:80]),
                    "company": company_name,
                    "resume_text": resume_text[:config.RAG_MAX_DOCUMENT_CHARS],
                    "job_description": job_description[:config.RAG_MAX_DOCUMENT_CHARS],
                    "questions": result.get("questions", []),
                    "answers": result.get("answers", []),
                    "match": persisted_match,
                    "created_at": _now(),
                }],
            )
        except Exception as e:
            log.warning("persist workflow failed: %s", e)
    return {"success": True, **result}


@router.post("/workflows/upload")
async def start_workflow_upload(
    file: UploadFile = File(...),
    job_description: str = Form(...),
    company_name: str = Form(""),
    linkedin_link: str = Form(""),
    github_link: str = Form(""),
    portfolio_link: str = Form(""),
    additional_info: str = Form(""),
    num_questions: int = Form(config.DEFAULT_QUESTION_COUNT),
    user: dict = Depends(rate_limited("workflows", config.RATE_WORKFLOWS_PER_MIN, 60)),
):
    """Upload a PDF or DOCX resume and run the same preparation workflow."""
    content = await file.read(config.MAX_FILE_SIZE + 1)
    if len(content) > config.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    resume_text = _extract_resume_text(file.filename or "", content)
    if not resume_text or len(resume_text.strip()) < config.MIN_RESUME_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="Could not extract enough text from this PDF or DOCX file.")
    return await start_workflow(
        resume_text=resume_text,
        job_description=job_description,
        company_name=company_name,
        linkedin_link=linkedin_link,
        github_link=github_link,
        portfolio_link=portfolio_link,
        additional_info=additional_info,
        num_questions=num_questions,
        user=user,
    )


def _extract_resume_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf_text(content)
    if suffix == ".docx":
        return _extract_docx_text(content)
    raise HTTPException(status_code=400, detail="Upload a PDF or DOCX resume, or paste the text instead.")


def _extract_pdf_text(content: bytes) -> str:
    from pypdf import PdfReader

    try:
        reader = PdfReader(BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


def _extract_docx_text(content: bytes) -> str:
    """Read the main DOCX document XML without adding a document-parser dependency.

    Decompression is capped so a crafted small archive cannot expand into a
    zip-bomb inside the worker process.
    """
    try:
        with zipfile.ZipFile(BytesIO(content)) as archive:
            with archive.open("word/document.xml") as member:
                raw = member.read(config.MAX_DOCX_XML_BYTES + 1)
            if len(raw) > config.MAX_DOCX_XML_BYTES:
                raise HTTPException(status_code=413, detail="DOCX is too large to process safely.")
            root = ElementTree.fromstring(raw)
        namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        paragraphs = []
        for node in root.iter(f"{namespace}p"):
            parts = [text.text or "" for text in node.iter(f"{namespace}t")]
            if parts:
                paragraphs.append("".join(parts))
        return "\n".join(paragraphs)
    except HTTPException:
        raise
    except (KeyError, zipfile.BadZipFile, ElementTree.ParseError):
        return ""


# --------------------------------------------------------------------------- #
# Company intelligence (auto-refreshing shared cache)
# --------------------------------------------------------------------------- #
@router.get("/companies/{company_name}/intelligence")
async def get_company_intelligence(
    company_name: str,
    refresh: bool = False,
    user: dict = Depends(rate_limited("intel", config.RATE_COACHING_PER_MIN, 60)),
):
    try:
        data = await company_intel.ensure_fresh(company_name, force=refresh)
    except Exception:
        raise HTTPException(status_code=503, detail="Company intelligence is temporarily unavailable.")
    return {"success": True, "data": data}


# --------------------------------------------------------------------------- #
# Resume Analyzer (cost-aware, no raw-resume persistence)
# --------------------------------------------------------------------------- #
@router.get("/resume-analyzer/usage")
async def resume_analyzer_usage(user: dict = Depends(get_user)):
    _db_or_503()
    try:
        return {"success": True, "data": await resume_analyzer.usage(user["uid"])}
    except Exception:
        raise HTTPException(status_code=503, detail="Resume Analyzer usage is temporarily unavailable.")


@router.get("/resume-analyzer/analyses")
async def list_resume_analyses(user: dict = Depends(get_user)):
    _db_or_503()
    try:
        response = await asyncio.to_thread(
            lambda: dbc.get_client().table("resume_analysis").select(
                "analysis_id,resume_score,extracted_skills,created_at"
            ).eq("user_id", user["uid"]).order("created_at", desc=True).limit(50).execute()
        )
        return {"success": True, "data": response.data or []}
    except Exception:
        raise HTTPException(status_code=503, detail="Resume Analyzer history is temporarily unavailable.")


@router.get("/resume-analyzer/analyses/{analysis_id}")
async def get_resume_analysis(analysis_id: str, user: dict = Depends(get_user)):
    _db_or_503()
    try:
        response = await asyncio.to_thread(
            lambda: dbc.get_client().table("resume_analysis").select("*").eq(
                "analysis_id", analysis_id
            ).eq("user_id", user["uid"]).limit(1).execute()
        )
        if not response.data:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return {"success": True, "data": response.data[0]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Resume Analyzer result is temporarily unavailable.")


@router.delete("/resume-analyzer/analyses/{analysis_id}")
async def delete_resume_analysis(
    analysis_id: str,
    user: dict = Depends(rate_limited("delete", config.RATE_DELETE_PER_MIN, 60)),
):
    """Owner-only delete of a saved resume analysis row."""
    _db_or_503()
    return await _delete_owned_or_404(
        "resume_analysis", "analysis_id", analysis_id, user["uid"], "Analysis not found."
    )


@router.post("/resume-analyzer/analyze")
async def analyze_resume(
    file: UploadFile = File(...),
    job_description: str = Form(""),
    user: dict = Depends(rate_limited("resume", config.RATE_COACHING_PER_MIN, 60)),
):
    """Analyze a PDF/DOCX in memory; raw upload bytes are discarded after parsing."""
    _db_or_503()
    filename = file.filename or ""
    if Path(filename).suffix.lower() not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Upload a PDF or DOCX resume.")
    content = await file.read(config.MAX_FILE_SIZE + 1)
    if len(content) > config.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Resume files must be 5 MB or smaller.")
    resume_text = _extract_resume_text(filename, content)
    # Ensure the file bytes are no longer retained by this request before the
    # model call; only extracted text is passed to the analysis service.
    del content
    if len(resume_text.strip()) < config.MIN_RESUME_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="Could not extract enough readable text from this resume.")
    if len(job_description) > config.RESUME_ANALYZER_MAX_JD_CHARS:
        raise HTTPException(status_code=422, detail="Job description is too long.")
    try:
        record, cached = await resume_analyzer.analyze(
            user_id=user["uid"], resume_text=resume_text, job_description=job_description,
        )
        return {"success": True, "data": record, "cached": cached}
    except PermissionError as exc:
        raise HTTPException(status_code=402, detail=str(exc))
    except provider.ProviderError as exc:
        raise HTTPException(status_code=503, detail="Resume analysis is temporarily unavailable. Please retry shortly.") from exc
    except Exception:
        raise HTTPException(status_code=503, detail="Resume analysis could not be completed. No quota was consumed; please retry.")


# --------------------------------------------------------------------------- #
# Company + salary + mode endpoints (from interview-skills, English)
# --------------------------------------------------------------------------- #
@router.get("/companies")
def list_companies():
    return {
        "success": True,
        "data": [
            {"name": name, **profile}
            for name, profile in company_profiles.COMPANY_PROFILES.items()
        ],
    }


class SalaryRequest(BaseModel):
    company: str = Field(min_length=1, max_length=160)
    role: str = Field(min_length=1, max_length=200)
    current_salary: str = Field(default="", max_length=200)
    target_range: str = Field(min_length=1, max_length=200)
    has_offer: str = Field(default="", max_length=2000)


class MatchAnalysisRequest(BaseModel):
    job_description: str = Field(min_length=80, max_length=60000)
    resume_text: str = Field(min_length=80, max_length=config.RAG_MAX_DOCUMENT_CHARS)


class CoachingPracticeRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=10, max_length=2000)
    answer: str = Field(min_length=20, max_length=12000)
    presence_metrics: dict = Field(default_factory=dict)


class CoachingTurnMessage(BaseModel):
    role: Literal["candidate", "coach"]
    text: str = Field(min_length=1, max_length=4000)


class CoachingTurnRequest(BaseModel):
    scenario: str = Field(min_length=1, max_length=100)
    difficulty: Literal["supportive", "realistic", "challenging"] = "realistic"
    coach_style: Literal["recruiter", "hiring-manager", "negotiator"] = "recruiter"
    opening_prompt: str = Field(min_length=10, max_length=2000)
    history: list[CoachingTurnMessage] = Field(default_factory=list, max_length=10)
    candidate_answer: str = Field(min_length=10, max_length=4000)


class ExplainRequest(BaseModel):
    question: str = Field(min_length=10, max_length=2000)
    answer: str = Field(min_length=20, max_length=12000)
    level: Literal["standard", "eli5"] = "standard"


@router.post("/coaching/salary")
def salary_script(payload: SalaryRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        return {"success": True, "data": analysis.salary_script(**payload.model_dump())}
    except provider.ProviderError as exc:
        status = 429 if provider.is_rate_limit_error(exc) else 503
        raise HTTPException(status_code=status, detail="The negotiation coach is temporarily busy. Please retry shortly.")


@router.post("/coaching/analyze")
async def analyze(payload: MatchAnalysisRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        data = await asyncio.wait_for(asyncio.to_thread(analysis.analyze_match, payload.job_description, payload.resume_text), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
        return {"success": True, "data": data}
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(status_code=503, detail="The role-fit coach timed out. Please retry shortly.")
    except provider.ProviderError as exc:
        status = 429 if provider.is_rate_limit_error(exc) else 503
        raise HTTPException(status_code=status, detail="The role-fit coach is temporarily busy. Please retry shortly.")


PRESENCE_ALLOWED_KEYS = {
    "handDetectionCounter", "handDetectionDuration", "notFacingCounter",
    "notFacingDuration", "badPostureDetectionCounter", "badPostureDuration",
    "sessionDurationSeconds", "eyeContactConsistency", "postureStability",
    "gestureRatePerMinute", "headTiltDeg", "shoulderTiltDeg",
    "gazeStabilityScore", "postureScore", "forwardHeadProxy",
}


def _sanitize_presence(metrics: dict | None) -> dict[str, float]:
    allowed: dict[str, float] = {}
    for key, value in (metrics or {}).items():
        if key not in PRESENCE_ALLOWED_KEYS or isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        numeric = float(value)
        if math.isfinite(numeric):
            allowed[key] = min(max(0, numeric), 100_000)
    return allowed


@router.post("/coaching/practice")
async def coaching_practice(payload: CoachingPracticeRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    _db_or_503()
    allowed_metrics = _sanitize_presence(payload.presence_metrics)

    # Memory + RAG grounding for the next drill. Neither depends on the
    # other, so fetch them concurrently instead of paying both latencies
    # back-to-back.
    async def _weakness_ctx() -> str:
        try:
            from backend.memory.profile import get_weakness_context

            return await asyncio.to_thread(get_weakness_context, user["uid"])
        except Exception:
            return ""

    async def _rag_ctx() -> str:
        if not rag.is_ready():
            return ""
        try:
            chunks = await rag.retrieve(user_id=user["uid"], query=payload.answer[:1200], top_k=2)
            return rag.format_context(chunks, max_chars=1200)
        except Exception:
            return ""

    weakness_ctx, rag_ctx = await asyncio.gather(_weakness_ctx(), _rag_ctx())
    try:
        result = await asyncio.wait_for(asyncio.to_thread(
            analysis.evaluate_coaching_practice,
            scenario=payload.scenario,
            prompt=payload.prompt,
            answer=payload.answer,
            presence_metrics=allowed_metrics,
            weakness_context=weakness_ctx,
            rag_context=rag_ctx,
        ), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
        if not result or result.get("error"):
            raise HTTPException(status_code=502, detail="The coach returned incomplete feedback. Please retry.")
        session_id = f"practice-{secrets.token_urlsafe(24)}"
        try:
            await asyncio.to_thread(
                dbc.insert,
                "practice_sessions",
                [{"session_id": session_id, "user_id": user["uid"]}],
            )
        except Exception:
            raise HTTPException(status_code=503, detail="The practice report could not be saved. Please retry shortly.")
        return {"success": True, "data": {**result, "session_id": session_id}}
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(status_code=503, detail="The practice coach timed out. Please retry shortly.")
    except provider.ProviderError as exc:
        status = 429 if provider.is_rate_limit_error(exc) else 503
        raise HTTPException(status_code=status, detail="The practice coach is temporarily busy. Please retry shortly.")


@router.post("/coaching/practice/turn")
async def coaching_practice_turn(payload: CoachingTurnRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        from backend.memory.profile import get_weakness_context

        try:
            weakness_ctx = await asyncio.to_thread(get_weakness_context, user["uid"])
        except Exception:
            weakness_ctx = ""
        result = await asyncio.wait_for(asyncio.to_thread(
            analysis.coaching_practice_turn,
            scenario=payload.scenario,
            difficulty=payload.difficulty,
            coach_style=payload.coach_style,
            opening_prompt=payload.opening_prompt,
            history=[item.model_dump() for item in payload.history],
            candidate_answer=payload.candidate_answer,
            weakness_context=weakness_ctx,
        ), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
        if result.get("error"):
            raise HTTPException(status_code=502, detail="The coach returned an incomplete response. Please retry.")
        return {"success": True, "data": result}
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(status_code=503, detail="The live coach timed out. Your transcript remains available.")
    except provider.ProviderError as exc:
        status = 429 if provider.is_rate_limit_error(exc) else 503
        raise HTTPException(status_code=status, detail="The live coach is temporarily busy. Your transcript remains available.")


@router.post("/coaching/explain")
async def coaching_explain(payload: ExplainRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    """Learn mode: teach why a model answer works, standard or ELI5 level."""
    try:
        result = await asyncio.wait_for(asyncio.to_thread(
            analysis.explain_answer, payload.question, payload.answer, payload.level,
        ), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
        if result.get("error"):
            raise HTTPException(status_code=502, detail="The explainer returned an incomplete response. Please retry.")
        return {"success": True, "data": result}
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(status_code=503, detail="The explainer timed out. Please retry shortly.")
    except provider.ProviderError as exc:
        status = 429 if provider.is_rate_limit_error(exc) else 503
        raise HTTPException(status_code=status, detail="The explainer is temporarily busy. Please retry shortly.")


# --------------------------------------------------------------------------- #
# Assessment rounds (aptitude -> technical -> judgment)
# --------------------------------------------------------------------------- #
class AssessmentStartRequest(BaseModel):
    role: str = Field(min_length=2, max_length=200)
    company: str = Field(default="", max_length=160)
    level: Literal["fresher", "mid", "senior"] = "mid"


class AssessmentSubmitRequest(BaseModel):
    round_index: int = Field(ge=0, le=10)
    responses: dict = Field(default_factory=dict)


@router.post("/assessment/start")
async def assessment_start(payload: AssessmentStartRequest, user: dict = Depends(rate_limited("assessment", config.RATE_ASSESSMENT_PER_HOUR, 3600))):
    _db_or_503()
    try:
        data = await asyncio.wait_for(assessment_service.start_attempt(user["uid"], payload.role, payload.company, payload.level), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
        return {"success": True, "data": data}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except (asyncio.TimeoutError, TimeoutError):
        raise HTTPException(status_code=503, detail="The assessment generator timed out. Please retry shortly.")
    except Exception:
        log.exception("assessment start failed")
        raise HTTPException(status_code=503, detail="The assessment generator is busy. Please retry shortly.")


@router.post("/assessment/attempts/{attempt_id}/submit")
async def assessment_submit(attempt_id: str, payload: AssessmentSubmitRequest, user: dict = Depends(rate_limited("assessment_submit", config.RATE_COACHING_PER_MIN, 60))):
    _db_or_503()
    try:
        data = await asyncio.to_thread(
            assessment_service.submit_round, user["uid"], attempt_id, payload.round_index, payload.responses
        )
        # Memory: feed the completed assessment into RAG so future sessions remember it
        if data.get("completed") and data.get("report") and rag.is_ready():
            try:
                report = data["report"]
                gaps = ", ".join(report.get("gap_skills") or []) or "none noted"
                strengths = ", ".join(report.get("strength_skills") or []) or "none noted"
                await rag.ingest_document(
                    user_id=user["uid"],
                    title="Assessment summary",
                    source_type="notes",
                    content=(
                        f"Assessment ({report.get('band','')} {report.get('total_percent','')}%) — "
                        f"Gaps: {gaps}. Strengths: {strengths}. "
                        f"Rounds: {', '.join(s.get('name','') for s in report.get('round_scores') or [])}"
                    )[:2000],
                )
            except Exception:
                pass
        return {"success": True, "data": data}
    except LookupError:
        raise HTTPException(status_code=404, detail="Assessment attempt not found.")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        log.exception("assessment submit failed")
        raise HTTPException(status_code=503, detail="Scoring is temporarily unavailable. Your answers were saved.")


@router.get("/assessment/attempts")
async def assessment_attempts(user: dict = Depends(get_user)):
    _db_or_503()
    try:
        data = await asyncio.to_thread(assessment_service.list_attempts, user["uid"])
        return {"success": True, "data": data}
    except Exception:
        raise HTTPException(status_code=503, detail="Assessment history is temporarily unavailable.")


@router.get("/assessment/attempts/{attempt_id}")
async def assessment_attempt(attempt_id: str, user: dict = Depends(get_user)):
    _db_or_503()
    try:
        data = await asyncio.to_thread(assessment_service.get_attempt, user["uid"], attempt_id)
        if not data:
            raise HTTPException(status_code=404, detail="Attempt not found.")
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Assessment state is temporarily unavailable.")


# --------------------------------------------------------------------------- #
# Candidate knowledge base (RAG)
# --------------------------------------------------------------------------- #
class KnowledgeIngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=config.MIN_RESUME_TEXT_LENGTH, max_length=config.RAG_MAX_DOCUMENT_CHARS)
    source_type: str = Field(default="notes", pattern=r"^(resume|portfolio|notes|session_report|company_intelligence)$")


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=10)


@router.get("/knowledge/status")
def knowledge_status(user: dict = Depends(get_user)):
    return {"success": True, "data": {"available": rag.is_ready()}}


@router.get("/knowledge/documents")
async def list_knowledge_documents(user: dict = Depends(get_user)):
    """List the caller's knowledge documents, newest first."""
    _db_or_503()
    try:
        docs = await rag.list_documents(user["uid"])
        return {"success": True, "data": docs}
    except Exception:
        raise HTTPException(status_code=503, detail="Knowledge documents are temporarily unavailable.")


@router.delete("/knowledge/documents/{document_id}")
async def delete_knowledge_document(
    document_id: str,
    user: dict = Depends(rate_limited("knowledge", config.RATE_KNOWLEDGE_PER_MIN, 60)),
):
    """Owner-only delete. Missing and foreign ids both return 404 (no existence oracle)."""
    _db_or_503()
    try:
        removed = await rag.delete_document(document_id=document_id, user_id=user["uid"])
    except rag.RAGUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=503, detail="Knowledge delete is temporarily unavailable.")
    if not removed:
        raise HTTPException(status_code=404, detail="Document not found.")
    return Response(status_code=204)


@router.post("/knowledge/documents")
async def ingest_knowledge(payload: KnowledgeIngestRequest, user: dict = Depends(rate_limited("knowledge", config.RATE_KNOWLEDGE_PER_MIN, 60))):
    try:
        data = await rag.ingest_document(
            user_id=user["uid"],
            title=payload.title,
            source_type=payload.source_type,
            content=payload.content,
        )
        return {"success": True, "data": data}
    except rag.RAGUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=503, detail="Knowledge indexing is temporarily unavailable.")


@router.post("/knowledge/search")
async def search_knowledge(payload: KnowledgeSearchRequest, user: dict = Depends(rate_limited("knowledge", config.RATE_KNOWLEDGE_PER_MIN, 60))):
    try:
        chunks = await rag.retrieve(user_id=user["uid"], query=payload.query, top_k=payload.top_k)
        return {"success": True, "data": [{
            "content": item.content,
            "source_title": item.source_title,
            "source_type": item.source_type,
            "document_id": item.document_id,
            "similarity": item.similarity,
        } for item in chunks]}
    except rag.RAGUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=503, detail="Knowledge search is temporarily unavailable.")


# --------------------------------------------------------------------------- #
# Feedback — usefulness rating (one row per session, upsert on repeat)
# --------------------------------------------------------------------------- #
class FeedbackRequest(BaseModel):
    session_id: str = Field(min_length=1, max_length=128)
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=1000)


def _ensure_feedback_session_owned(session_id: str, user_id: str) -> None:
    """Require a server-issued session owned by the authenticated caller."""
    table = "practice_sessions" if session_id.startswith("practice-") else "interview_sessions"
    rows = dbc.select_where(table, {"session_id": session_id})
    if not rows or rows[0].get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Session not found.")


@router.post("/feedback")
async def submit_feedback(
    payload: FeedbackRequest,
    user: dict = Depends(rate_limited("feedback", config.RATE_FEEDBACK_PER_MIN, 60)),
):
    """Upsert one rating per session_id (architect decision T4).

    Second POST for the same session replaces rating/comment and returns 200
    with the updated row — never 409. ``user_id`` always comes from the caller.
    """
    _db_or_503()
    await asyncio.to_thread(
        _ensure_feedback_session_owned, payload.session_id, user["uid"]
    )
    row = {
        "user_id": user["uid"],
        "session_id": payload.session_id,
        "rating": payload.rating,
        "comment": payload.comment,
    }
    rows = await asyncio.to_thread(dbc.upsert, "report_feedback", [row], "session_id")
    return {"success": True, "data": rows[0] if rows else row}


@router.get("/feedback/summary")
async def feedback_summary(user: dict = Depends(get_user)):
    """Caller's own average rating + count (owner average, not a global dashboard)."""
    _db_or_503()
    rows = await asyncio.to_thread(
        dbc.select_where, "report_feedback", {"user_id": user["uid"]}
    )
    ratings = [int(r["rating"]) for r in rows if r.get("rating") is not None]
    count = len(ratings)
    average = round(sum(ratings) / count, 2) if count else None
    return {"success": True, "data": {"average": average, "count": count}}


# --------------------------------------------------------------------------- #
# Analytics — privacy-safe product events + LAUNCH_READINESS gate metrics (T8)
# --------------------------------------------------------------------------- #
_PROP_KEY_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,39}$")


class AnalyticsEventRequest(BaseModel):
    """Allowlisted funnel event. Free text in props is rejected (422)."""

    event_name: Literal[
        "prepare_started", "prepare_completed", "interview_completed", "feedback_submitted"
    ]
    props: dict[str, Any] = Field(default_factory=dict, max_length=10)

    @field_validator("props")
    @classmethod
    def _props_non_string_primitives_only(cls, value: dict[str, Any]) -> dict[str, Any]:
        for key, item in value.items():
            if not _PROP_KEY_PATTERN.match(key):
                raise ValueError("props keys must be short lowercase identifiers")
            if item is None or isinstance(item, (bool, int)):
                continue
            if isinstance(item, float):
                if not math.isfinite(item):
                    raise ValueError("props numbers must be finite")
                continue
            raise ValueError("props values must be non-string primitives — no free text")
        return value


@router.post("/analytics/events")
async def track_analytics_event(
    payload: AnalyticsEventRequest,
    user: dict = Depends(rate_limited("analytics", config.RATE_ANALYTICS_PER_MIN, 60)),
):
    """Record one allowlisted funnel event for the authenticated caller.

    Privacy contract: ``event_name`` is one of the four allowlisted funnel
    steps; ``props`` may only hold non-string primitives under short
    identifier keys (free text, resume, and transcript content → 422).
    Unknown top-level body keys are stripped by the model. ``user_id`` and
    ``occurred_at`` are attached server-side; the client never sends them.
    """
    _db_or_503()
    row = {
        "event_name": payload.event_name,
        "user_id": user["uid"],
        "occurred_at": _now(),
        "props": payload.props,
    }
    rows = await asyncio.to_thread(dbc.insert, "product_events", [row])
    return {"success": True, "data": rows[0] if rows else row}


@router.get("/analytics/summary")
async def analytics_summary(user: dict = Depends(get_user)):
    """LAUNCH_READINESS gate metrics (T8). Auth required.

    Scope: **global aggregates for any authenticated user** — single-tenant
    beta accepted risk (architect decision); not multi-tenant safe.

    Exact denominators (also returned in ``meta.formulas``):
    - ``prep_completion_pct`` = product_events(prepare_completed) /
      product_events(prepare_started) * 100; null when started = 0.
    - ``interview_completion_pct`` = interview_sessions rows with a non-empty
      ``report`` / total interview_sessions rows * 100; null when entered = 0.
      Proxy: no ``interview_started`` event exists — a persisted session row
      stands in for "entered studio", a non-empty report for "completed".
    - ``avg_rating`` = mean of ``report_feedback.rating``; null when empty.

    Uses ``get_user`` only (no rate-limit scope): read-only aggregate over
    small tables, cheap enough for the beta.
    """
    _db_or_503()

    async def _event_count(name: str) -> int:
        rows = await asyncio.to_thread(dbc.select_where, "product_events", {"event_name": name})
        return len(rows)

    started = await _event_count("prepare_started")
    completed = await _event_count("prepare_completed")
    interview_events = await _event_count("interview_completed")
    feedback_events = await _event_count("feedback_submitted")

    sessions = await asyncio.to_thread(dbc.select_where, "interview_sessions", {})
    entered = len(sessions)

    def _has_report(session: dict) -> bool:
        report = session.get("report")
        if isinstance(report, (dict, list)):
            return bool(report)
        if isinstance(report, str):
            return bool(report.strip())
        return False

    with_report = sum(1 for session in sessions if _has_report(session))

    feedback_rows = await asyncio.to_thread(dbc.select_where, "report_feedback", {})
    ratings = [int(r["rating"]) for r in feedback_rows if r.get("rating") is not None]

    prep_pct = round(completed / started * 100, 1) if started else None
    interview_pct = round(with_report / entered * 100, 1) if entered else None
    avg_rating = round(sum(ratings) / len(ratings), 2) if ratings else None

    return {
        "success": True,
        "data": {
            "prep_completion_pct": prep_pct,
            "interview_completion_pct": interview_pct,
            "avg_rating": avg_rating,
            "counts": {
                "prepare_started": started,
                "prepare_completed": completed,
                "interview_completed_events": interview_events,
                "feedback_submitted_events": feedback_events,
                "interviews_entered": entered,
                "interviews_with_report": with_report,
                "feedback_count": len(ratings),
            },
            "meta": {
                "scope": "global aggregates for any authenticated user (single-tenant beta)",
                "formulas": {
                    "prep_completion_pct": (
                        "prepare_completed events / prepare_started events * 100"
                    ),
                    "interview_completion_pct": (
                        "interview_sessions rows with non-empty report / "
                        "interview_sessions rows entered * 100 (table proxy — "
                        "no interview_started event exists)"
                    ),
                    "avg_rating": "mean of report_feedback.rating",
                },
            },
        },
    }


# --------------------------------------------------------------------------- #
# Memory — weak/strong trends and spaced repetition
# --------------------------------------------------------------------------- #
@router.get("/memory/profile")
async def memory_profile(user: dict = Depends(get_user)):
    _db_or_503()
    try:
        from backend.memory.profile import get_weakness_digest, get_skill_trends, get_spaced_repetition_schedule

        digest = get_weakness_digest(user["uid"])
        trends = get_skill_trends(user["uid"])
        schedule = get_spaced_repetition_schedule(user["uid"])
        return {"success": True, "data": {"digest": digest, "trends": trends, "schedule": schedule}}
    except Exception:
        raise HTTPException(status_code=503, detail="Memory profile temporarily unavailable.")


@router.get("/memory/drills")
async def memory_drills(user: dict = Depends(get_user)):
    """Due spaced-repetition drills (due_at <= now), most overdue first.

    Seeded day-0 from the weakness digest on first read; each item carries the
    server schedule (due_at, interval_index, streak) plus a practice template.
    """
    _db_or_503()
    try:
        from backend.memory.profile import get_due_drills

        return {"success": True, "data": await asyncio.to_thread(get_due_drills, user["uid"])}
    except Exception:
        raise HTTPException(status_code=503, detail="Practice drills temporarily unavailable.")


class DrillReviewRequest(BaseModel):
    result: Literal["again", "good"]


@router.post("/memory/drills/{skill}/review")
async def memory_drill_review(
    skill: str,
    payload: DrillReviewRequest,
    user: dict = Depends(rate_limited("drill_review", config.RATE_DRILL_REVIEW_PER_MIN, 60)),
):
    """Advance or reset spaced-repetition state for one skill (T9).

    ``good`` advances ``interval_index`` along the ``[1, 3, 7, 14]``-day
    ladder (due in INTERVALS[new_index] days); ``again`` resets to index 0
    (due in 1 day) and clears the streak. 404 when the skill is neither
    tracked in drill_reviews nor in the caller's current weakness digest —
    upsert only for known skills, never garbage rows.
    """
    _db_or_503()
    try:
        from backend.memory.profile import record_review

        row = await asyncio.to_thread(record_review, user["uid"], skill, payload.result)
    except Exception:
        raise HTTPException(status_code=503, detail="Practice drills temporarily unavailable.")
    if row is None:
        raise HTTPException(status_code=404, detail="Drill not found.")
    return {"success": True, "data": row}


# --------------------------------------------------------------------------- #
# Live interview (WebSocket)
# --------------------------------------------------------------------------- #
def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


class InterviewStart(BaseModel):
    workflow_id: str
    duration: int = Field(15, ge=5, le=60)
    is_audio: bool = False
    persona: str = Field(default="maya", max_length=20, pattern=r"^(maya|alex|priya)$")
    # T11 intensity: Literal → invalid values are a 422. Default "standard"
    # preserves pre-T11 behaviour exactly (golden prompt test).
    intensity: Literal["easy", "standard", "hard"] = "standard"


def _fallback_interview_report() -> dict:
    return {
        "scores": {},
        "strengths": [],
        "improvements": ["Review the saved transcript and retry scoring from a future session."],
        "summary": "Your interview transcript was saved, but detailed AI scoring is temporarily unavailable.",
        "verdict": "Session captured successfully; scoring can be retried when the provider is available.",
        "hiring_manager": {"decision": "lean-no-hire", "confidence": "low", "risk": "Insufficient signal to assess hiring risk.", "bar_raiser_notes": "Complete a full interview with concrete examples and measurable outcomes."},
    }


@router.post("/interviews/start")
async def start_interview(payload: InterviewStart, user: dict = Depends(rate_limited("interview", config.RATE_INTERVIEW_STARTS_PER_MIN, 60))):
    try:
        workflow = await asyncio.to_thread(dbc.select_where, "workflows", {"workflow_id": payload.workflow_id}) or []
    except Exception:
        workflow = []
    owned = [w for w in workflow if w.get("user_id") == user["uid"]]
    if not owned:
        raise HTTPException(status_code=404, detail="Workflow not found")
    session_id = secrets.token_urlsafe(16)
    ws_token = secrets.token_urlsafe(32)
    sess = await registry.create("hustlrzz", user["uid"], session_id)
    sess.state["ws_token"] = ws_token
    sess.state["ws_issued_at"] = time.time()
    sess.state["workflow_id"] = payload.workflow_id
    sess.state["duration"] = payload.duration
    sess.state["is_audio"] = payload.is_audio
    sess.state["persona"] = payload.persona
    # T11: intensity rides registry state (not the WS URL) so the prompt is
    # rebuilt from session state on connect and nothing leaks via query logs.
    sess.state["intensity"] = payload.intensity
    # Token is returned in the JSON body only — never in the WS URL, where it
    # would leak through access logs, proxies, and browser referrers. The
    # client sends it as the first WebSocket message instead.
    qs = (
        f"?user_id={user['uid']}&workflow_id={payload.workflow_id}"
        f"&duration={payload.duration}&is_audio={str(payload.is_audio).lower()}&persona={payload.persona}"
    )
    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "websocket_parameter": qs,
            "ws_token": ws_token,
        },
    }


@router.websocket("/ws/{session_id}")
async def interview_ws(
    websocket: WebSocket,
    session_id: str,
    user_id: str = "",
    workflow_id: str = "",
    duration: int = 15,
    is_audio: bool = False,
    persona: str = "maya",
):
    await websocket.accept()
    sess = await registry.get("hustlrzz", user_id, session_id)
    expected = sess.state.get("ws_token", "") if sess else ""
    issued_at = float(sess.state.get("ws_issued_at", 0)) if sess else 0.0
    token_fresh = issued_at and (time.time() - issued_at) <= config.WS_TOKEN_TTL_SECONDS

    # Handshake: first frame must be {"type": "auth", "token": ...}.
    try:
        first = await asyncio.wait_for(
            websocket.receive_json(), timeout=config.WS_AUTH_TIMEOUT_SECONDS
        )
    except (asyncio.TimeoutError, TimeoutError, WebSocketDisconnect, Exception):
        await websocket.close(code=1008)
        return
    token = str(first.get("token") or "") if isinstance(first, dict) and first.get("type") == "auth" else ""
    if (
        not sess or not token or not secrets.compare_digest(str(expected), str(token))
        or not token_fresh
    ):
        await websocket.close(code=1008)
        return
    if sess.state.get("active"):
        # One live connection per session prevents duplicate transcripts.
        await websocket.close(code=1013)
        return
    sess.state["active"] = True
    # Single-use handshake token: a captured token cannot open a second socket.
    sess.state["ws_issued_at"] = 0.0
    duration = max(5, min(60, int(duration or 15)))
    # T11: intensity from registry state (validated at start); normalize so a
    # bad state value can never fail the persisted-row check constraint.
    intensity = str(sess.state.get("intensity") or "standard")
    if intensity not in ("easy", "standard", "hard"):
        intensity = "standard"
    started_at = time.monotonic()

    # Load prepared questions for this workflow so the interviewer has a script.
    import json

    questions: list[dict] = []
    workflow_record: dict = {}
    try:
        rows = await asyncio.to_thread(
            dbc.select_where, "workflows", {"workflow_id": workflow_id, "user_id": user_id}
        )
        for r in rows:
            workflow_record = r
            if isinstance(r.get("questions"), list):
                questions.extend(r["questions"])
    except Exception as exc:
        # Never kill the socket over persistence trouble, but make it visible.
        log.warning("workflow load failed for session %s: %s", session_id, exc)

    resume_text = workflow_record.get("resume_text") or ""
    job_description = workflow_record.get("job_description") or ""
    stored_match = workflow_record.get("match") if isinstance(workflow_record.get("match"), dict) else {}
    persona_val = persona or (sess.state.get("persona", "maya") if sess else "maya")
    system = build_interviewer_system(
        workflow_record.get("company") or "the target company",
        workflow_record.get("title") or "the target role",
        questions,
        duration,
        company_context=stored_match.get("company_research") if isinstance(stored_match, dict) else None,
        persona=persona_val,
        intensity=intensity,
    )
    # Memory: bias live probing toward previously weak areas
    try:
        from backend.memory.profile import get_weakness_context

        _weak = await asyncio.to_thread(get_weakness_context, user_id)
        if _weak:
            system += f"\n\n{_weak}\nPrioritize probing these weak areas with specific follow-ups."
    except Exception:
        pass
    transcript: list[dict] = []
    end_presence: dict = {}

    try:
        opener_text = questions[0].get("question") if questions else ""
        opener = {"question": opener_text or "Tell me about yourself.", "message": ""}
        transcript.append({"from": "interviewer", "text": opener["question"]})
        await websocket.send_json({"type": "question", "data": opener})
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "message":
                text = str(msg.get("text", "")).strip()
                if not text:
                    await websocket.send_json({"type": "error", "data": {"message": "Please send an answer before continuing."}})
                    continue
                if len(text) > 12000:
                    await websocket.send_json({"type": "error", "data": {"message": "Please keep one answer under 12,000 characters."}})
                    continue
                retrieval_context = ""
                if rag.is_ready():
                    try:
                        chunks = await rag.retrieve(user_id=user_id, query=text, top_k=3)
                        retrieval_context = rag.format_context(chunks, max_chars=3500)
                    except Exception:
                        # A coaching session should continue if retrieval is slow
                        # or unavailable; the prepared question script remains.
                        retrieval_context = ""
                try:
                    reply = await asyncio.wait_for(asyncio.to_thread(
                        interviewer_turn,
                        system,
                        transcript,
                        text,
                        retrieval_context=retrieval_context,
                        elapsed_seconds=int(time.monotonic() - started_at),
                        duration_minutes=duration,
                        total_questions=len(questions),
                    ), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
                except (asyncio.TimeoutError, TimeoutError):
                    await websocket.send_json({"type": "error", "data": {"message": "The interviewer timed out. Please try your answer again in a moment."}})
                    continue
                except provider.ProviderError:
                    await websocket.send_json({"type": "error", "data": {"message": "The interviewer is temporarily unavailable. Please try your answer again in a moment."}})
                    continue
                transcript.append({"from": "candidate", "text": text})
                spoken = reply.get("message") or reply.get("question") or ""
                transcript.append({"from": "interviewer", "text": spoken})
                await websocket.send_json({"type": "message", "data": reply})
            elif msg.get("type") == "end":
                # Optional browser-derived presence snapshot rides along with
                # the end signal so the judge can ground delivery feedback.
                end_presence = _sanitize_presence(msg.get("presence"))
                break
    except WebSocketDisconnect:
        pass
    finally:
        sess.state["active"] = False
        elapsed_seconds = int(time.monotonic() - started_at)
        # Judge + persist session report.
        report = {}
        if transcript:
            try:
                report = await asyncio.wait_for(asyncio.to_thread(
                    judge_report, questions, transcript, resume_text, job_description, presence_metrics=end_presence
                ), timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
            except (asyncio.TimeoutError, TimeoutError, Exception) as exc:
                log.warning("judge failed: %s", exc)
                report = _fallback_interview_report()
        if dbc.is_ready() and transcript:
            try:
                await asyncio.to_thread(
                    dbc.insert,
                    "interview_sessions",
                    [{
                        "session_id": session_id,
                        "user_id": user_id,
                        "workflow_id": workflow_id,
                        "transcript": transcript,
                        "report": report,
                        "is_audio": is_audio,
                        "duration_seconds": elapsed_seconds,
                        "intensity": intensity,
                        "created_at": _now(),
                    }],
                )
            except Exception as exc:
                log.warning("persist interview failed: %s", exc)
        if report and rag.is_ready():
            try:
                await rag.ingest_document(
                    user_id=user_id,
                    title="Interview coaching report",
                    source_type="session_report",
                    content=json.dumps(report, ensure_ascii=False),
                )
            except Exception:
                # History persistence is already complete; RAG enrichment should
                # not affect the completed interview result.
                pass
        if report:
            try:
                await websocket.send_json({"type": "report", "data": report})
            except Exception:
                pass
        try:
            await websocket.close()
        except Exception:
            pass
        await registry.delete("hustlrzz", user_id, session_id)


from backend.agents.interviewer import build_interviewer_system, interviewer_turn, judge_report  # noqa: E402
from backend.assessment import service as assessment_service  # noqa: E402

app.include_router(router)
