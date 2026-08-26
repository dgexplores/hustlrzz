"""FastAPI app entrypoint for Hustlrzz.

English-native AI mock interview coach. Merges:
  - hustlrzz       (prep workflow, live WebSocket interviewer, judge)
  - interview-skills (company profiles, JD-vs-resume, salary negotiation, modes)
  - AI-Interview-Coach (Next.js shell consumed by frontend)
  - v3: auto-refreshing company intelligence, assessment rounds, humanized
    live interviews, rate limiting, session hygiene.
"""

from __future__ import annotations

import secrets
import time
import zipfile
import math
from io import BytesIO
from pathlib import Path
from typing import Literal, Optional
from xml.etree import ElementTree

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

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

app = FastAPI(title="Hustlrzz", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_origin_regex=config.CORS_ORIGIN_REGEX or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bearer = HTTPBearer(auto_error=False)
router = APIRouter()


def _db_or_503():
    if not dbc.is_ready():
        raise HTTPException(
            status_code=503,
            detail="Backend not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )


def rate_limited(scope: str, limit: int, window_seconds: int):
    """Per-user sliding-window request guard bound to an authenticated user."""

    async def dependency(request: Request, user: dict = Depends(get_user)) -> dict:
        allowed, retry_after = limiter.allow(f"{scope}:{user['uid']}", limit, window_seconds)
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


@router.get("/workflows")
async def list_workflows(user: dict = Depends(get_user)):
    _db_or_503()
    rows = dbc.select_where("workflows", {"user_id": user["uid"]}, order="created_at")
    return {"success": True, "data": rows}


@router.get("/interviews")
async def list_interviews(user: dict = Depends(get_user)):
    _db_or_503()
    rows = dbc.select_where("interview_sessions", {"user_id": user["uid"]}, order="created_at")
    return {"success": True, "data": rows}


@router.get("/health")
def health():
    return {
        "status": "ok",
        "version": app.version,
        "ai_configured": provider.is_configured(),
        "provider": config.AI_PROVIDER,
        "db_ready": dbc.is_ready(),
    }


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
        if any(k in err for k in ("429", "Rate limit", "rate_limit")):
            raise HTTPException(status_code=429, detail=err)
        raise HTTPException(status_code=500, detail=err)
    # Persist workflow record (if db ready).
    if dbc.is_ready():
        try:
            persisted_match = {
                **(result.get("company_match") or {}),
                "company_research": result.get("company_research") or {},
            }
            dbc.insert("workflows", [{
                "workflow_id": result["workflow_id"],
                "user_id": user["uid"],
                "title": (result.get("company_match") or {}).get("summary", job_description[:80]),
                "company": company_name,
                "questions": result.get("questions", []),
                "answers": result.get("answers", []),
                "match": persisted_match,
                "created_at": _now(),
            }])
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
    user: dict = Depends(get_user),
):
    """Upload a PDF or DOCX resume and run the same preparation workflow."""
    content = await file.read()
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
                log.warning("docx document exceeded decompression cap; truncated")
            root = ElementTree.fromstring(raw)
        namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        paragraphs = []
        for node in root.iter(f"{namespace}p"):
            parts = [text.text or "" for text in node.iter(f"{namespace}t")]
            if parts:
                paragraphs.append("".join(parts))
        return "\n".join(paragraphs)
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
        response = dbc.get_client().table("resume_analysis").select(
            "analysis_id,resume_score,extracted_skills,created_at"
        ).eq("user_id", user["uid"]).order("created_at", desc=True).limit(50).execute()
        return {"success": True, "data": response.data or []}
    except Exception:
        raise HTTPException(status_code=503, detail="Resume Analyzer history is temporarily unavailable.")


@router.get("/resume-analyzer/analyses/{analysis_id}")
async def get_resume_analysis(analysis_id: str, user: dict = Depends(get_user)):
    _db_or_503()
    try:
        response = dbc.get_client().table("resume_analysis").select("*").eq(
            "analysis_id", analysis_id
        ).eq("user_id", user["uid"]).limit(1).execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Analysis not found")
        return {"success": True, "data": response.data[0]}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Resume Analyzer result is temporarily unavailable.")


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


@router.post("/coaching/salary")
def salary_script(payload: SalaryRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        return {"success": True, "data": analysis.salary_script(**payload.model_dump())}
    except provider.ProviderError as exc:
        status = 429 if "429" in str(exc) or "rate" in str(exc).lower() else 503
        raise HTTPException(status_code=status, detail="The negotiation coach is temporarily busy. Please retry shortly.")


@router.post("/coaching/analyze")
async def analyze(payload: MatchAnalysisRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        return {"success": True, "data": analysis.analyze_match(payload.job_description, payload.resume_text)}
    except provider.ProviderError as exc:
        status = 429 if "429" in str(exc) or "rate" in str(exc).lower() else 503
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
    allowed_metrics = _sanitize_presence(payload.presence_metrics)
    # Memory + RAG grounding for the next drill
    try:
        from backend.memory.profile import get_weakness_context

        weakness_ctx = get_weakness_context(user["uid"])
    except Exception:
        weakness_ctx = ""
    rag_ctx = ""
    if rag.is_ready():
        try:
            chunks = await rag.retrieve(user_id=user["uid"], query=payload.answer[:1200], top_k=2)
            rag_ctx = rag.format_context(chunks, max_chars=1200)
        except Exception:
            rag_ctx = ""
    try:
        result = analysis.evaluate_coaching_practice(
            scenario=payload.scenario,
            prompt=payload.prompt,
            answer=payload.answer,
            presence_metrics=allowed_metrics,
            weakness_context=weakness_ctx,
            rag_context=rag_ctx,
        )
        if not result or result.get("error"):
            raise HTTPException(status_code=502, detail="The coach returned incomplete feedback. Please retry.")
        return {"success": True, "data": result}
    except provider.ProviderError as exc:
        status = 429 if "429" in str(exc) or "rate" in str(exc).lower() else 503
        raise HTTPException(status_code=status, detail="The practice coach is temporarily busy. Please retry shortly.")


@router.post("/coaching/practice/turn")
async def coaching_practice_turn(payload: CoachingTurnRequest, user: dict = Depends(rate_limited("coaching", config.RATE_COACHING_PER_MIN, 60))):
    try:
        from backend.memory.profile import get_weakness_context

        try:
            weakness_ctx = get_weakness_context(user["uid"])
        except Exception:
            weakness_ctx = ""
        result = analysis.coaching_practice_turn(
            scenario=payload.scenario,
            difficulty=payload.difficulty,
            coach_style=payload.coach_style,
            opening_prompt=payload.opening_prompt,
            history=[item.model_dump() for item in payload.history],
            candidate_answer=payload.candidate_answer,
            weakness_context=weakness_ctx,
        )
        if result.get("error"):
            raise HTTPException(status_code=502, detail="The coach returned an incomplete response. Please retry.")
        return {"success": True, "data": result}
    except provider.ProviderError as exc:
        status = 429 if "429" in str(exc) or "rate" in str(exc).lower() else 503
        raise HTTPException(status_code=status, detail="The live coach is temporarily busy. Your transcript remains available.")


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
        data = await assessment_service.start_attempt(user["uid"], payload.role, payload.company, payload.level)
        return {"success": True, "data": data}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        log.exception("assessment start failed")
        raise HTTPException(status_code=503, detail="The assessment generator is busy. Please retry shortly.")


@router.post("/assessment/attempts/{attempt_id}/submit")
async def assessment_submit(attempt_id: str, payload: AssessmentSubmitRequest, user: dict = Depends(get_user)):
    _db_or_503()
    try:
        data = assessment_service.submit_round(user["uid"], attempt_id, payload.round_index, payload.responses)
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
        return {"success": True, "data": assessment_service.list_attempts(user["uid"])}
    except Exception:
        raise HTTPException(status_code=503, detail="Assessment history is temporarily unavailable.")


@router.get("/assessment/attempts/{attempt_id}")
async def assessment_attempt(attempt_id: str, user: dict = Depends(get_user)):
    _db_or_503()
    try:
        data = assessment_service.get_attempt(user["uid"], attempt_id)
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
async def search_knowledge(payload: KnowledgeSearchRequest, user: dict = Depends(get_user)):
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
# Live interview (WebSocket)
# --------------------------------------------------------------------------- #
def _now() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


class InterviewStart(BaseModel):
    workflow_id: str
    duration: int = Field(15, ge=5, le=60)
    is_audio: bool = False


def _fallback_interview_report() -> dict:
    return {
        "scores": {},
        "strengths": [],
        "improvements": ["Review the saved transcript and retry scoring from a future session."],
        "summary": "Your interview transcript was saved, but detailed AI scoring is temporarily unavailable.",
        "verdict": "Session captured successfully; scoring can be retried when the provider is available.",
    }


@router.post("/interviews/start")
async def start_interview(payload: InterviewStart, user: dict = Depends(rate_limited("interview", config.RATE_INTERVIEW_STARTS_PER_MIN, 60))):
    try:
        workflow = dbc.select_where("workflows", {"workflow_id": payload.workflow_id}) or []
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
    qs = (
        f"?user_id={user['uid']}&workflow_id={payload.workflow_id}"
        f"&duration={payload.duration}&is_audio={str(payload.is_audio).lower()}&token={ws_token}"
    )
    return {"success": True, "data": {"session_id": session_id, "websocket_parameter": qs}}


@router.websocket("/ws/{session_id}")
async def interview_ws(
    websocket: WebSocket,
    session_id: str,
    user_id: str = "",
    workflow_id: str = "",
    token: str = "",
    duration: int = 15,
    is_audio: bool = False,
):
    sess = await registry.get("hustlrzz", user_id, session_id)
    expected = sess.state.get("ws_token", "") if sess else ""
    issued_at = float(sess.state.get("ws_issued_at", 0)) if sess else 0.0
    token_fresh = issued_at and (time.time() - issued_at) <= config.WS_TOKEN_TTL_SECONDS
    if (
        not sess or not token or not secrets.compare_digest(str(expected), str(token))
        or not token_fresh
    ):
        await websocket.accept()
        await websocket.close(code=1008)
        return
    if sess.state.get("active"):
        # One live connection per session prevents duplicate transcripts.
        await websocket.accept()
        await websocket.close(code=1013)
        return
    sess.state["active"] = True
    duration = max(5, min(60, int(duration or 15)))
    started_at = time.monotonic()

    # Load prepared questions for this workflow so the interviewer has a script.
    import json

    questions: list[dict] = []
    workflow_record: dict = {}
    resume_text = ""
    job_description = ""
    try:
        rows = dbc.select_where("workflows", {"workflow_id": workflow_id, "user_id": user_id})
        for r in rows:
            workflow_record = r
            if isinstance(r.get("questions"), list):
                questions.extend(r["questions"])
    except Exception as exc:
        # Never kill the socket over persistence trouble, but make it visible.
        log.warning("workflow load failed for session %s: %s", session_id, exc)

    stored_match = workflow_record.get("match") if isinstance(workflow_record.get("match"), dict) else {}
    system = build_interviewer_system(
        workflow_record.get("company") or "the target company",
        workflow_record.get("title") or "the target role",
        questions,
        duration,
        company_context=stored_match.get("company_research") if isinstance(stored_match, dict) else None,
    )
    # Memory: bias live probing toward previously weak areas
    try:
        from backend.memory.profile import get_weakness_context

        _weak = get_weakness_context(user_id)
        if _weak:
            system += f"\n\n{_weak}\nPrioritize probing these weak areas with specific follow-ups."
    except Exception:
        pass
    transcript: list[dict] = []
    end_presence: dict = {}

    await websocket.accept()
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
                    reply = interviewer_turn(
                        system,
                        transcript,
                        text,
                        retrieval_context=retrieval_context,
                        elapsed_seconds=int(time.monotonic() - started_at),
                        duration_minutes=duration,
                        total_questions=len(questions),
                    )
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
                report = judge_report(questions, transcript, resume_text, job_description, presence_metrics=end_presence)
            except Exception as exc:
                log.warning("judge failed: %s", exc)
                report = _fallback_interview_report()
        if dbc.is_ready() and transcript:
            try:
                dbc.insert("interview_sessions", [{
                    "session_id": session_id,
                    "user_id": user_id,
                    "workflow_id": workflow_id,
                    "transcript": transcript,
                    "report": report,
                    "is_audio": is_audio,
                    "duration_seconds": elapsed_seconds,
                    "created_at": _now(),
                }])
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
