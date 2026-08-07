from fastapi import (
    APIRouter, File, UploadFile, Form, Depends, HTTPException, Body,
    WebSocket, WebSocketDisconnect, Query, Request,
)
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional
import secrets
import time
from urllib.parse import urlparse
from pydantic import HttpUrl
from backend.tools.supabase_config import supabase, supabase_ready
from backend.tools.logger import get_logger, audit
from backend.tools.ssrf import is_blocked_host
from backend.data.database import firestore_db
from backend.data.schemas import Profile
from backend.agents.interviewer.agent import start_agent_session, client_to_agent_messaging, agent_to_client_messaging, save_transcript
from backend.tools.connection_manager import manager
from backend.api.schemas import InterviewStartRequest
import asyncio
from datetime import datetime, timezone
from backend.coordinator.preparation_workflow import generate_session_id
from backend.agents.interview_judge.agent import _run_judge_from_session
from backend.coordinator.session_manager import session_service

# PDF processing imports
from backend.config import PDFConfig
from backend.services.pdf import PDFProcessor
from backend.coordinator.preparation_workflow import run_preparation_workflow
from backend.services.pdf.exceptions import (
    FileTooLargeError,
    InvalidFileTypeError,
    InvalidPDFError,
    EmptyPDFError,
    PDFProcessingError
)

router = APIRouter()
bearer = HTTPBearer()

logger = get_logger("routes")

# Initialize PDF processor with configuration
pdf_config = PDFConfig()
pdf_processor = PDFProcessor(pdf_config)

async def verify_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
):
    if not supabase_ready or supabase is None:
        raise HTTPException(
            status_code=503,
            detail="Backend not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env (see .env.example) and restart.",
        )
    request_id = getattr(request.state, "request_id", None)
    try:
        # Server-side verification of the Supabase access token (JWT).
        user_response = supabase.auth.get_user(credentials.credentials)
        user = user_response.user
        uid = user.id
        email = user.email or ""
        meta = user.user_metadata or {}
        name = meta.get("full_name") or meta.get("name") or ""
        picture = meta.get("avatar_url") or meta.get("picture") or ""

        audit("auth.verify_success", request_id=request_id, uid=uid)
        return {
            "uid": uid,
            "email": email,
            "name": name,
            "picture": picture
        }
    except Exception as e:
        # Invalid or expired tokens raise AuthApiError; log details, return generic.
        logger.info("Token verification failed: %s", e)
        audit("auth.verify_failed", request_id=request_id, reason="invalid_or_expired")
        raise HTTPException(status_code=401, detail="Invalid or expired token")

@router.get("/")
def public_route():
    return {"success": True, "data": None}

# Default avatar URL for users without profile pictures
DEFAULT_AVATAR_URL = "https://api.dicebear.com/7.x/avataaars/svg?seed=default"


def _validate_optional_url(field_name: str, value: str) -> str:
    """Validate an optional URL form field; returns normalized string or ''.

    Rejects malformed URLs and any host that resolves to internal/private
    infrastructure (SSRF protection for the server-side portfolio scraper).
    """
    value = (value or "").strip()
    if not value:
        return ""
    try:
        normalized = str(HttpUrl(value))
    except Exception:
        raise HTTPException(status_code=422, detail=f"Invalid URL for {field_name}")

    if is_blocked_host(urlparse(normalized).hostname or ""):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid URL for {field_name}: internal/private hosts are not allowed",
        )
    return normalized


def _validate_num_questions(num_questions: int) -> int:
    """Clamp the requested question count to a sane, abuse-resistant range."""
    if not (1 <= num_questions <= 200):
        raise HTTPException(
            status_code=422,
            detail="num_questions must be between 1 and 200",
        )
    return num_questions

# auth route
@router.post("/auth/init")
def init_user_profile(user=Depends(verify_token)):
    existing = firestore_db.get_profile(user["uid"])
    
    # Set default avatar if picture is empty or None
    photo_url = user.get("picture", "")
    if not photo_url or photo_url.strip() == "":
        photo_url = DEFAULT_AVATAR_URL

    # If new user, or want to update on every login
    if not existing["data"]:
        profile_data = Profile(
            name=user.get("name", ""),
            email=user.get("email", ""),
            photoURL=photo_url
        )
        firestore_db.create_or_update_profile(user["uid"], profile_data)

    return {
        "success": True,
        "data": {
            "name": user.get("name", ""), 
            "email": user.get("email", ""), # keep this 
            "photoURL": photo_url,
            "isNew": existing["data"] is None
        }
    }

# user route
@router.get("/user")
def get_user_info(user=Depends(verify_token)): 
    profile_result = firestore_db.get_profile(user["uid"])
    
    # Set default avatar if photoURL is empty or None
    if profile_result["data"]:
        photo_url = profile_result["data"].get("photoURL", "")
        if not photo_url or photo_url.strip() == "":
            profile_result["data"]["photoURL"] = DEFAULT_AVATAR_URL
    
    return {
        "success": True if profile_result["data"] else False,
        "data": profile_result["data"]
    }


@router.put("/user")
def update_user_info(user=Depends(verify_token), updates: Profile = Body(...)):
    updated = firestore_db.create_or_update_profile(user["uid"], updates)
    return {
        "success": True if updated["data"] else False,
        "data": updated["data"]
    }


@router.delete("/user")
def delete_user_account(request: Request, user=Depends(verify_token)):
    """Permanently delete the user's account and all their data."""
    request_id = getattr(request.state, "request_id", None)
    uid = user["uid"]
    try:
        # Delete the user row (workflows/interviews cascade via FK)
        firestore_db.delete_user(uid)
        # Delete the auth account (service role)
        supabase.auth.admin.delete_user(uid)
        audit("user.deleted", request_id=request_id, uid=uid)
        return {"success": True, "data": None}
    except Exception as e:
        logger.exception("Account deletion failed for %s: %s", uid, e)
        audit("user.delete_failed", request_id=request_id, uid=uid)
        raise HTTPException(status_code=500, detail="Failed to delete account")

# workflows routes
@router.get("/workflows")
def get_all_workflows(user=Depends(verify_token)):
    result = firestore_db.get_workflows_for_user(user["uid"])
    return {
        "success": True if len(result["data"])>0 else False,
        "data": result["data"]
    }

@router.get("/workflows/{workflow_id}/recommended-qa")
def get_recommended_qas(workflow_id: str, user=Depends(verify_token)):
    result = firestore_db.get_recommended_qas(user["uid"], workflow_id)
    return {
        "success": True if result["data"] else False,
        "data": result["data"]
    }

@router.get("/workflows/{workflow_id}/interviews")
def get_all_interviews(workflow_id: str, user=Depends(verify_token)):
    result = firestore_db.get_interviews_for_workflow(user["uid"], workflow_id)
    return {
        "success": True if len(result["data"])>0 else False,
        "data": result["data"]
    }

# websocket
@router.websocket("/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket, 
    session_id: str,
    user_id: str = Query(...),
    workflow_id: str = Query(...),
    token: str = Query(None),
    duration: int = Query(10), #change the default duration here
    is_audio: bool = Query(False)
):    
    """Client WebSocket endpoint to interact with real-time interview agent."""

    # SECURITY: only the user who started this session via POST /interviews/start
    # may connect. Auth is an opaque token (issued with the session, never
    # guessable from the query string); the user_id binding is checked too.
    bound = await session_service.get_session("Hustlrzz", user_id, session_id)
    expected_token = bound.state.get("ws_token", "") if bound else ""
    if (
        bound is None
        or not token
        or not secrets.compare_digest(str(expected_token), str(token))
    ):
        logger.warning(
            "Rejected WebSocket connect for session %s (user_id=%s): bad token or unbound session",
            session_id, user_id,
        )
        audit(
            "ws.connect_rejected",
            session_id=session_id,
            claimed_user_id=user_id,
            reason="invalid_token_or_unbound_session",
        )
        await websocket.close(code=1008)
        return

    # Wait for client connection
    await manager.connect(websocket)
    logger.info("Client #%s connected (user %s), audio mode: %s", session_id, user_id, is_audio)

    try: 
        # Start agent session
        live_events, live_request_queue, session = await start_agent_session(session_id, user_id, workflow_id, duration, is_audio)

        # Start tasks
        agent_to_client_task = asyncio.create_task(
            agent_to_client_messaging(websocket, live_events, session)
        )
        client_to_agent_task = asyncio.create_task(
            client_to_agent_messaging(websocket, live_request_queue, session)
        )
        await asyncio.gather(agent_to_client_task, client_to_agent_task)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
        print(f"❌ Client #{session_id} disconnected")
        try:
            # Manually expire session
            session.state["duration"] = int(
                (datetime.now(timezone.utc) - session.state.get("start_time")).total_seconds() / 60
            )

            # Save transcript
            save_transcript(session)
            print(f"[SAVE]: Transcript saved for session {session_id}")

            # Generate feedback
            await _run_judge_from_session(session)
            print(f"[FEEDBACK]: Feedback generated for session {session_id}")

            # FINALIZE: close the session
            try:
                await session_service.delete_session(
                    app_name=session.app_name,
                    user_id=session.user_id,
                    session_id=session.id
                )
                print(f"[CLEANUP]: Session {session.id} successfully closed.")
            except Exception as e:
                print(f"[CLEANUP ERROR]: Failed to close session {session.id}: {e}")
        except Exception as e:
            print(f"[ERROR]: Failed to finalize session after disconnect: {e}")
    except Exception as e:
        print(f"[ERROR] Client #{session_id} error: {e}")
        manager.disconnect(websocket)
        try:
            await websocket.close()
        except Exception:
            pass

@router.post("/interviews/start")
async def start_interview(
    request: Request,
    payload: InterviewStartRequest,
    user=Depends(verify_token),
):
    request_id = getattr(request.state, "request_id", None)

    # SECURITY: the workflow must belong to the authenticated user.
    workflow = firestore_db.get_workflow(user["uid"], payload.workflow_id)
    if not (workflow.get("data")):
        audit(
            "interview.start_rejected",
            request_id=request_id,
            uid=user["uid"],
            workflow_id=payload.workflow_id,
            reason="workflow_not_found",
        )
        raise HTTPException(status_code=404, detail="Workflow not found")

    session_id = generate_session_id()

    # Bind the session to its owner, with an opaque one-time WebSocket token
    # so the WS endpoint can authenticate the connection (query params alone
    # are guessable and must never be trusted as proof of ownership).
    ws_token = secrets.token_urlsafe(32)
    bound_session = await session_service.create_session(
        app_name="Hustlrzz",
        user_id=user["uid"],
        session_id=session_id,
    )
    bound_session.state["ws_token"] = ws_token

    # Format WebSocket parameters
    websocket_parameter = (
        f"?user_id={user['uid']}&workflow_id={payload.workflow_id}"
        f"&duration={payload.duration}&is_audio={str(payload.is_audio).lower()}"
        f"&token={ws_token}"
    )

    audit(
        "interview.start",
        request_id=request_id,
        uid=user["uid"],
        session_id=session_id,
        workflow_id=payload.workflow_id,
    )

    return {
        "success": True,
        "data": {
            "session_id": session_id,
            "websocket_parameter": websocket_parameter
        }
    }

@router.post("/interviews/{workflow_id}/{session_id}/feedback")
async def generate_feedback(workflow_id: str, session_id: str, user=Depends(verify_token)):
    feedback_result = firestore_db.get_feedback(user["uid"], workflow_id, session_id)

    return {
        "success": feedback_result["data"] is not None,
        "data": feedback_result["data"]
    }

# Authenticated workflow APIs
@router.post("/workflows/start-with-pdf")
async def start_workflow_with_pdf(
    request: Request,
    file: UploadFile = File(...),
    job_description: str = Form(...),
    linkedin_link: str = Form(""),
    github_link: str = Form(""),
    portfolio_link: str = Form(""),
    additional_info: str = Form(""),
    num_questions: int = Form(50),
    session_id: Optional[str] = Form(None),
    user=Depends(verify_token)
):
    start_time = time.time()
    user_id = user["uid"]
    request_id = getattr(request.state, "request_id", None)

    # Validate optional social URLs (reject malformed/malicious URLs)
    linkedin_link = _validate_optional_url("linkedin_link", linkedin_link)
    github_link = _validate_optional_url("github_link", github_link)
    portfolio_link = _validate_optional_url("portfolio_link", portfolio_link)
    num_questions = _validate_num_questions(num_questions)

    try:
        # Process PDF and extract resume text
        resume_text = await pdf_processor.extract_text_from_upload(file)
        
        if not resume_text or len(resume_text.strip()) < pdf_config.MIN_TEXT_LENGTH:
            raise EmptyPDFError(f"Extracted resume text is too short (less than {pdf_config.MIN_TEXT_LENGTH} characters)")
        
        # Update user profile with provided social links and additional info
        if linkedin_link or github_link or portfolio_link or additional_info:
            try:
                # Get current profile
                current_profile = firestore_db.get_profile(user_id)
                current_data = current_profile.get("data", {}) or {}
                
                # Create updated profile with new social links
                updated_profile = Profile(
                    name=current_data.get("name", user.get("name", "")),
                    email=current_data.get("email", user.get("email", "")),
                    photoURL=current_data.get("photoURL", user.get("picture", "")),
                    linkedinLink=linkedin_link if linkedin_link else current_data.get("linkedinLink"),
                    githubLink=github_link if github_link else current_data.get("githubLink"),
                    portfolioLink=portfolio_link if portfolio_link else current_data.get("portfolioLink"),
                    additionalInfo=additional_info if additional_info else current_data.get("additionalInfo")
                )
                
                # Update profile in database
                firestore_db.create_or_update_profile(user_id, updated_profile)
                print(f"Updated user profile with social links for user {user_id}")
            except Exception as profile_error:
                print(f"Warning: Failed to update user profile: {profile_error}")
                # Continue with workflow even if profile update fails
        
        # Start the preparation workflow
        workflow_result = await run_preparation_workflow(
            user_id=user_id,
            resume_text=resume_text,
            job_description=job_description,
            linkedin_link=linkedin_link,
            github_link=github_link,
            portfolio_link=portfolio_link,
            additional_info=additional_info,
            num_questions=num_questions,
            session_id=session_id
        )
        
        processing_time = time.time() - start_time
        
        # Return workflow results
        if workflow_result.get("success", False):
            audit(
                "workflow.start",
                request_id=request_id,
                uid=user_id,
                workflow_id=workflow_result.get("workflow_id"),
                completed_agents=workflow_result.get("completed_agents", []),
            )
            return {
                "success": True,
                "session_id": workflow_result.get("session_id"),
                "workflow_id": workflow_result.get("workflow_id"),
                "user_id": user_id,
                "completed_agents": workflow_result.get("completed_agents", []),
                "processing_time": processing_time
            }
        else:
            logger.warning(
                "Workflow execution failed for user %s: %s",
                user_id, workflow_result.get("error"),
            )
            return {
                "success": False,
                "error": "Workflow execution failed",
                "user_id": user_id,
                "processing_time": processing_time
            }
            
    except (FileTooLargeError,) as e:
        audit("workflow.start_rejected", request_id=request_id, uid=user_id, reason="file_too_large")
        raise HTTPException(status_code=413, detail=str(e))
    except (InvalidFileTypeError, InvalidPDFError, EmptyPDFError) as e:
        audit("workflow.start_rejected", request_id=request_id, uid=user_id, reason="invalid_file")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Workflow execution failed for user %s: %s", user_id, e)
        audit("workflow.start_failed", request_id=request_id, uid=user_id)
        raise HTTPException(status_code=500, detail="Workflow execution failed")


@router.post("/workflows/start-with-text")
async def start_workflow_with_text(
    request: Request,
    resume_text: str = Form(...),
    job_description: str = Form(...),
    linkedin_link: str = Form(""),
    github_link: str = Form(""),
    portfolio_link: str = Form(""),
    additional_info: str = Form(""),
    num_questions: int = Form(50),
    session_id: Optional[str] = Form(None),
    user=Depends(verify_token)
):
    start_time = time.time()
    user_id = user["uid"]
    request_id = getattr(request.state, "request_id", None)

    # Validate optional social URLs (reject malformed/malicious URLs)
    linkedin_link = _validate_optional_url("linkedin_link", linkedin_link)
    github_link = _validate_optional_url("github_link", github_link)
    portfolio_link = _validate_optional_url("portfolio_link", portfolio_link)
    num_questions = _validate_num_questions(num_questions)

    try:
        # Validate resume text
        if not resume_text or len(resume_text.strip()) < pdf_config.MIN_TEXT_LENGTH:
            raise HTTPException(status_code=400, detail=f"Resume text is too short (less than {pdf_config.MIN_TEXT_LENGTH} characters)")        
        
        # Update user profile with provided social links and additional info
        if linkedin_link or github_link or portfolio_link or additional_info:
            try:
                # Get current profile
                current_profile = firestore_db.get_profile(user_id)
                current_data = current_profile.get("data", {}) or {}
                
                # Create updated profile with new social links
                updated_profile = Profile(
                    name=current_data.get("name", user.get("name", "")),
                    email=current_data.get("email", user.get("email", "")),
                    photoURL=current_data.get("photoURL", user.get("picture", "")),
                    linkedinLink=linkedin_link if linkedin_link else current_data.get("linkedinLink"),
                    githubLink=github_link if github_link else current_data.get("githubLink"),
                    portfolioLink=portfolio_link if portfolio_link else current_data.get("portfolioLink"),
                    additionalInfo=additional_info if additional_info else current_data.get("additionalInfo")
                )
                
                # Update profile in database
                firestore_db.create_or_update_profile(user_id, updated_profile)
                print(f"Updated user profile with social links for user {user_id}")
            except Exception as profile_error:
                print(f"Warning: Failed to update user profile: {profile_error}")
                # Continue with workflow even if profile update fails
        
        # Start the preparation workflow
        workflow_result = await run_preparation_workflow(
            user_id=user_id,
            resume_text=resume_text,
            job_description=job_description,
            linkedin_link=linkedin_link,
            github_link=github_link,
            portfolio_link=portfolio_link,
            additional_info=additional_info,
            num_questions=num_questions,
            session_id=session_id
        )
        
        processing_time = time.time() - start_time
        
        # Return workflow results
        if workflow_result.get("success", False):
            audit(
                "workflow.start",
                request_id=request_id,
                uid=user_id,
                workflow_id=workflow_result.get("workflow_id"),
                completed_agents=workflow_result.get("completed_agents", []),
            )
            return {
                "success": True,
                "session_id": workflow_result.get("session_id"),
                "workflow_id": workflow_result.get("workflow_id"),
                "user_id": user_id,
                "completed_agents": workflow_result.get("completed_agents", []),
                "processing_time": processing_time
            }
        else:
            logger.warning(
                "Workflow execution failed for user %s: %s",
                user_id, workflow_result.get("error"),
            )
            return {
                "success": False,
                "error": "Workflow execution failed",
                "user_id": user_id,
                "processing_time": processing_time
            }
            
    except Exception as e:
        logger.exception("Workflow execution failed for user %s: %s", user_id, e)
        audit("workflow.start_failed", request_id=request_id, uid=user_id)
        raise HTTPException(status_code=500, detail="Workflow execution failed")
