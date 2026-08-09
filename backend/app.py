"""FastAPI app entrypoint for hustlrzzv2.

English-native AI mock interview coach. Merges:
  - hustlrzz       (prep workflow, live WebSocket interviewer, judge)
  - interview-skills (company profiles, JD-vs-resume, salary negotiation, modes)
  - AI-Interview-Coach (Next.js shell consumed by frontend)
"""

from __future__ import annotations

import secrets
import time
from typing import Optional
from urllib.parse import urlparse

from fastapi import (
    APIRouter,
    Body,
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
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from backend import config, db as dbc
from backend.ai import provider
from backend.career import analysis, company_profiles
from backend.rag import service as rag
from backend.session import registry
from backend.workflow.preparation import run_preparation_workflow

app = FastAPI(title="Hustlrzz V2", version="2.0.0")

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


def _valid_url(host: str) -> str:
    return host


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
    num_questions: int = Form(50),
    user: dict = Depends(get_user),
):
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
            dbc.insert("workflows", [{
                "workflow_id": result["workflow_id"],
                "user_id": user["uid"],
                "title": (result.get("company_match") or {}).get("summary", job_description[:80]),
                "company": company_name,
                "questions": result.get("questions", []),
                "answers": result.get("answers", []),
                "match": result.get("company_match", {}),
                "created_at": _now(),
            }])
        except Exception as e:
            print("persist workflow failed:", e)
    return {"success": True, **result}


@router.post("/workflows/upload")
async def start_workflow_upload(
    file: UploadFile = File(...),
    job_description: str = Form(...),
    company_name: str = Form(""),
    linkedin_link: str = Form(""),
    github_link: str = Form(""),
    portfolio_link: str = Form(""),
    num_questions: int = Form(50),
    user: dict = Depends(get_user),
):
    """Upload a PDF resume and run the same prep workflow."""
    content = await file.read()
    if len(content) > config.MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large")
    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes supported (or paste text).")
    resume_text = _extract_pdf_text(content)
    if not resume_text or len(resume_text.strip()) < config.MIN_RESUME_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="Could not extract enough text from PDF.")
    return await start_workflow(
        resume_text=resume_text,
        job_description=job_description,
        company_name=company_name,
        linkedin_link=linkedin_link,
        github_link=github_link,
        portfolio_link=portfolio_link,
        num_questions=num_questions,
        user=user,
    )


def _extract_pdf_text(content: bytes) -> str:
    from pypdf import PdfReader
    from io import BytesIO

    try:
        reader = PdfReader(BytesIO(content))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception:
        return ""


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
    company: str = ""
    role: str = ""
    current_salary: str = ""
    target_range: str = ""
    has_offer: str = ""


@router.post("/coaching/salary")
def salary_script(payload: SalaryRequest, user: dict = Depends(get_user)):
    return {"success": True, "data": analysis.salary_script(**payload.model_dump())}


@router.post("/coaching/analyze")
async def analyze(job_description: str = Body(...), resume_text: str = Body(...), user: dict = Depends(get_user)):
    return {"success": True, "data": analysis.analyze_match(job_description, resume_text)}


# --------------------------------------------------------------------------- #
# Candidate knowledge base (RAG)
# --------------------------------------------------------------------------- #
class KnowledgeIngestRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=config.MIN_RESUME_TEXT_LENGTH, max_length=config.RAG_MAX_DOCUMENT_CHARS)
    source_type: str = Field(default="notes", pattern="^(resume|portfolio|notes|session_report)$")


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=4000)
    top_k: int = Field(default=5, ge=1, le=10)


@router.get("/knowledge/status")
def knowledge_status(user: dict = Depends(get_user)):
    return {"success": True, "data": {"available": rag.is_ready()}}


@router.post("/knowledge/documents")
async def ingest_knowledge(payload: KnowledgeIngestRequest, user: dict = Depends(get_user)):
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


@router.post("/interviews/start")
async def start_interview(payload: InterviewStart, user: dict = Depends(get_user)):
    try:
        workflow = dbc.select_where("workflows", {"workflow_id": payload.workflow_id}) or []
    except Exception:
        workflow = []
    owned = [w for w in workflow if w.get("user_id") == user["uid"]]
    if not owned:
        raise HTTPException(status_code=404, detail="Workflow not found")
    session_id = secrets.token_urlsafe(16)
    ws_token = secrets.token_urlsafe(32)
    sess = await registry.create("hustlrzzv2", user["uid"], session_id)
    sess.state["ws_token"] = ws_token
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
    sess = await registry.get("hustlrzzv2", user_id, session_id)
    expected = sess.state.get("ws_token", "") if sess else ""
    if not sess or not token or not secrets.compare_digest(str(expected), str(token)):
        await websocket.close(code=1008)
        return

    # Load prepared questions for this workflow so interviewer has a script.
    import json

    questions = []
    try:
        rows = dbc.select_where("workflows", {"workflow_id": workflow_id})
        for r in rows:
            if isinstance(r.get("questions"), list):
                questions.extend(r["questions"])
    except Exception:
        pass

    system = build_interviewer_system(
        "hustlrzzv2", "the role", questions, duration
    )
    transcript: list[dict] = []

    await websocket.accept()
    try:
        # Opening question.
        opener = {"question": questions[0]["question"] if questions else "Tell me about yourself.", "message": ""}
        await websocket.send_json({"type": "question", "data": opener})
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "message":
                text = msg.get("text", "")
                transcript.append({"from": "candidate", "text": text})
                retrieval_context = ""
                if rag.is_ready():
                    try:
                        chunks = await rag.retrieve(user_id=user_id, query=text, top_k=3)
                        retrieval_context = rag.format_context(chunks, max_chars=3500)
                    except Exception:
                        # A coaching session should continue if retrieval is slow
                        # or unavailable; the prepared question script remains.
                        retrieval_context = ""
                reply = interviewer_turn(system, transcript, text, retrieval_context=retrieval_context)
                transcript.append({"from": "interviewer", "text": reply.get("message") or reply.get("question") or ""})
                await websocket.send_json({"type": "message", "data": reply})
            elif msg.get("type") == "end":
                break
    except WebSocketDisconnect:
        pass
    finally:
        # Judge + persist session report.
        report = {}
        if transcript:
            try:
                report = judge_report(system, transcript, "", "")
            except Exception as exc:
                print("judge failed:", exc)
        if dbc.is_ready() and transcript:
            try:
                dbc.insert("interview_sessions", [{
                    "session_id": session_id,
                    "user_id": user_id,
                    "workflow_id": workflow_id,
                    "transcript": transcript,
                    "report": report,
                    "is_audio": is_audio,
                    "created_at": _now(),
                }])
            except Exception as exc:
                print("persist interview failed:", exc)
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
        await registry.delete("hustlrzzv2", user_id, session_id)


from backend.agents.interviewer import build_interviewer_system, interviewer_turn, judge_report  # noqa: E402

app.include_router(router)
