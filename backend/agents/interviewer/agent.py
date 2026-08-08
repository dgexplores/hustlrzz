"""Mock interviewer agent — conducts a timed interview via Groq (free text LLM).

The conversation runs over a WebSocket with this protocol (unchanged from the
original design, so the Flutter frontend needs no changes):

  agent -> client:  {"mime_type": "text/plain", "data": "<streaming text>"}
                    {"turn_complete": true, "interrupted": false}
                    {"type": "end", "data": "..."}   (then close)
  client -> agent:  {"mime_type": "text/plain", "data": "<candidate answer>"}
                    {"type": "control", "action": "end_interview"}  (wrapped in data)
"""

import asyncio
import base64
import json
from datetime import datetime, timedelta, timezone

from fastapi import WebSocketDisconnect

from backend.agents.interview_judge.agent import _run_judge_from_session
from backend.agents.interviewer.prompt import get_background_prompt
from backend.config import set_google_cloud_env_vars
from backend.coordinator.session_manager import session_service
from backend.data.database import firestore_db
from backend.data.schemas import Interview
from backend.tools import groq_provider

# Load environment variables
set_google_cloud_env_vars()

APP_NAME = "Hustlrzz"


async def start_agent_session(session_id, user_id, workflow_id, duration_minutes, is_audio=False):
    """Create a session and return (agent_queue, client_queue, session).

    ``agent_queue`` carries candidate turns into the interviewer loop.
    """
    session = await session_service.create_session(
        app_name=APP_NAME,
        user_id=user_id,
        session_id=session_id,
    )

    session.state.setdefault("transcript", [])
    session.state["history"] = []  # [{role, content}] used to prompt the LLM
    session.state["workflow_id"] = workflow_id
    session.state["is_audio"] = bool(is_audio)
    setup_duration(session, duration_minutes)

    # Load the candidate profile + recommended Q&As for this workflow
    personal_experience = firestore_db.get_personal_experience(user_id, workflow_id) or {}
    if isinstance(personal_experience, dict):
        data = personal_experience.get("data")
        personal_experience = data if isinstance(data, dict) and data else {}
    else:
        personal_experience = {}
    recommend_qas = firestore_db.get_recommended_qas(user_id, workflow_id) or []
    if isinstance(recommend_qas, dict):
        data = recommend_qas.get("data")
        recommend_qas = data if isinstance(data, list) and data else []
    else:
        recommend_qas = []

    session.state["personal_experience"] = personal_experience
    session.state["recommend_qas"] = recommend_qas
    session.state["system_prompt"] = get_background_prompt(
        session.state["personal_experience"], session.state["recommend_qas"]
    )

    agent_queue = asyncio.Queue()
    # Signal the interviewer loop to open with the first question.
    await agent_queue.put({"__intro__": True})

    return agent_queue, agent_queue, session


async def agent_to_client_messaging(websocket, live_events, session):
    """Consume candidate turns, generate the interviewer's reply, stream it."""
    try:
        while True:
            if is_session_expired(session):
                print(f"[SESSION ENDED] Session {session.id} expired")
                await _finalize_session(
                    websocket,
                    session,
                    goodbye=(
                        "⏰ Time's up! Thank you for participating in the mock interview. "
                        "We'll save your transcript now."
                    ),
                )
                return

            item = await live_events.get()
            if isinstance(item, dict) and item.get("__control__") == "end_interview":
                print(f"[CLIENT] User ended session {session.id}")
                await _finalize_session(websocket, session)
                return

            # Generate the interviewer's next message with Groq. A transient AI
            # failure must not kill the interview — fall back gracefully instead.
            try:
                text = await asyncio.to_thread(_generate_response, session)
            except Exception as exc:
                print(f"[ERROR] Generation failed for session {session.id}: {exc}")
                text = ""
            if not text:
                text = (
                    "That's great — let's move on. Could you walk me through your "
                    "most recent project and the impact it had?"
                )

            session.state["transcript"].append({"role": "AI", "message": text})
            session.state["history"].append({"role": "assistant", "content": text})

            # Stream the reply (single chunk) and signal turn completion.
            await websocket.send_text(json.dumps({"mime_type": "text/plain", "data": text}))
            await websocket.send_text(json.dumps({"turn_complete": True, "interrupted": False}))
            print(f"[AGENT -> CLIENT] {text[:80]}...")
    except Exception as exc:
        print(f"[ERROR] agent_to_client_messaging failed: {exc}")


async def client_to_agent_messaging(websocket, request_queue, session):
    """Read candidate messages from the WebSocket into the interviewer loop."""
    try:
        while True:
            message_json = await websocket.receive_text()
            message = json.loads(message_json)
            mime_type = message.get("mime_type", "text/plain")
            data = message.get("data", "")

            # Control messages (e.g. end_interview) arrive wrapped in the data field.
            try:
                control = json.loads(data)
                if (
                    isinstance(control, dict)
                    and control.get("type") == "control"
                    and control.get("action") == "end_interview"
                ):
                    print(f"[CLIENT -> AGENT] end_interview for session {session.id}")
                    session.state["user_ended"] = True
                    await request_queue.put({"__control__": "end_interview"})
                    continue
            except Exception:
                pass

            if mime_type == "text/plain":
                session.state["transcript"].append({"role": "user", "message": data})
                session.state["history"].append({"role": "user", "content": data})
                await request_queue.put({"role": "user", "content": data})
                print(f"[CLIENT -> AGENT] {data[:80]}")
            elif mime_type == "audio/pcm" or mime_type.startswith("audio/"):
                # Turn-based voice support: transcribe with Groq Whisper, then chat.
                text = await asyncio.to_thread(_transcribe_audio, data)
                if text:
                    session.state["transcript"].append({"role": "user", "message": text})
                    session.state["history"].append({"role": "user", "content": text})
                    await request_queue.put({"role": "user", "content": text})
                else:
                    print("[CLIENT -> AGENT] audio received but transcription empty")
            else:
                print(f"[WARN] Unsupported mime_type: {mime_type}")
    except WebSocketDisconnect:
        # Client went away (tab closed / network drop). Wake the interviewer
        # loop so it saves the transcript and generates feedback.
        print(f"[CLIENT] Disconnected from session {session.id}")
        try:
            await request_queue.put({"__control__": "end_interview"})
        except Exception:
            pass
    except Exception as exc:
        print(f"[ERROR] client_to_agent_messaging failed: {exc}")


def _generate_response(session) -> str:
    """One Groq call: system prompt + full conversation so far."""
    history = session.state.get("history", [])
    if not history:
        user_content = (
            "Begin the mock interview now: greet the candidate and ask your first question."
        )
    else:
        lines = []
        for turn in history:
            speaker = "Candidate" if turn["role"] == "user" else "Interviewer"
            lines.append(f"{speaker}: {turn['content']}")
        user_content = (
            "\n".join(lines)
            + "\n\nRespond as the interviewer with your next question or follow-up."
        )
    return groq_provider.chat(session.state.get("system_prompt", ""), user_content)


def _transcribe_audio(base64_data: str) -> str:
    """Decode base64 audio and transcribe with Groq Whisper (best effort)."""
    try:
        audio_bytes = base64.b64decode(base64_data)
        return groq_provider.transcribe(audio_bytes, mime_type="audio/pcm", filename="audio.pcm")
    except Exception as exc:
        print(f"[ERROR] transcription failed: {exc}")
        return ""


async def _finalize_session(websocket, session, goodbye: str = ""):
    """Save the transcript, generate feedback, notify the client and close."""
    try:
        # Notify the client if it is still connected. A closed socket (abrupt
        # tab close / network drop) must never prevent the transcript and
        # feedback from being saved, so these sends are isolated and best-effort.
        try:
            if goodbye:
                await websocket.send_text(json.dumps({"mime_type": "text/plain", "data": goodbye}))
                await websocket.send_text(json.dumps({"turn_complete": True, "interrupted": False}))

            end_message = {"type": "end", "data": "Conversation ended. Thank you for participating!"}
            await websocket.send_text(json.dumps(end_message))
        except Exception as send_exc:
            print(f"[WARN] Client already gone; skipping goodbye for session {session.id}: {send_exc}")

        # Duration for the record
        start_time = session.state.get("start_time")
        if start_time:
            duration = int((datetime.now(timezone.utc) - start_time).total_seconds() / 60)
            session.state["duration"] = max(duration, 0)

        save_transcript(session)
        print(f"[SAVE] Transcript saved for session {session.id}")

        # Report honestly: the judge stores the reason on failure so the
        # misleading "Feedback generated" log can't hide a lost interview.
        feedback = await _run_judge_from_session(session)
        if feedback is None:
            reason = session.state.get("feedback_error", "unknown")
            print(f"[WARN] Feedback NOT generated for session {session.id}: {reason}")
        else:
            print(f"[FEEDBACK] Feedback generated for session {session.id}")

        try:
            await websocket.close(code=1000)
        except Exception:
            pass
    except Exception as exc:
        print(f"[ERROR] finalize failed for session {session.id}: {exc}")
    finally:
        try:
            await session_service.delete_session(
                app_name=session.app_name,
                user_id=session.user_id,
                session_id=session.id,
            )
            print(f"[CLEANUP] Session {session.id} closed.")
        except Exception as exc:
            print(f"[CLEANUP ERROR] Failed to close session {session.id}: {exc}")


def is_session_expired(session) -> bool:
    start = session.state.get("start_time")
    duration = session.state.get("duration_minutes")
    if not start or not duration:
        return False
    return datetime.now(timezone.utc) > start + timedelta(minutes=duration)


def setup_duration(session, duration_minutes: int):
    """Set the start time and allowed duration for a session."""
    session.state["start_time"] = datetime.now(timezone.utc)
    session.state["duration_minutes"] = duration_minutes


def save_transcript(session):
    transcript = session.state.get("transcript", [])
    workflow_id = session.state.get("workflow_id")

    interview_data = Interview(
        transcript=transcript,
        duration_minutes=session.state.get("duration"),
    )
    firestore_db.create_interview(
        user_id=session.user_id,
        session_id=session.id,
        workflow_id=workflow_id,
        interview_data=interview_data,
    )
