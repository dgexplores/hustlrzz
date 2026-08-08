"""Interview judge agent — evaluates a candidate's transcript and produces
structured feedback (positives, improvement areas, resources) via Groq.
"""

import asyncio
import json
import logging
import re
import time

import requests

from backend.agents.interview_judge.prompt import (
    get_interview_judge_input_data,
    get_interview_judge_instruction,
)
from backend.config import set_google_cloud_env_vars
from backend.data.database import firestore_db
from backend.data.schemas import Feedback
from backend.tools import groq_provider
from pydantic import ValidationError

# Load environment variables
set_google_cloud_env_vars()

logger = logging.getLogger(__name__)


def run_judge_from_session(session):
    """Synchronous wrapper (kept for compatibility)."""
    return asyncio.run(_run_judge_from_session(session))


def _transcript_to_text(transcript) -> str:
    """Convert the stored transcript [{role, message}] into readable dialogue."""
    if not transcript:
        return "(empty interview — no answers were given)"
    lines = []
    for turn in transcript:
        role = turn.get("role", "")
        message = turn.get("message", "")
        speaker = "Interviewer" if role in ("AI", "assistant") else "Candidate"
        lines.append(f"{speaker}: {message}")
    return "\n".join(lines)


async def _run_judge_from_session(session):
    """Evaluate an interview and store the feedback. Safe to call multiple times."""
    if session.state.get("feedback_generated"):
        return session.state.get("feedback")

    transcript = session.state.get("transcript", [])
    transcript_text = _transcript_to_text(transcript)
    personal_experience = session.state.get("personal_experience", {}) or {}
    recommend_qas = session.state.get("recommend_qas", []) or []

    input_data = get_interview_judge_input_data(
        personal_experience,
        transcript_text,
        json.dumps(recommend_qas, ensure_ascii=False) if recommend_qas else "",
    )

    # Retry transient Groq failures (free-tier rate limits) a few times with
    # backoff before giving up; record the real reason so callers can log it.
    raw_feedback = None
    last_error = None
    for attempt in range(3):
        try:
            raw_feedback = groq_provider.chat_json(
                get_interview_judge_instruction(), input_data, temperature=0.4
            )
            break
        except Exception as exc:
            last_error = exc
            logger.warning(
                "Judge generation attempt %d/3 failed for session %s: %s",
                attempt + 1, session.id, exc,
            )
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    if not raw_feedback:
        reason = (
            f"empty response after retries"
            if last_error is None
            else f"Groq error after 3 attempts: {last_error}"
        )
        logger.error("Judge returned no feedback for session %s: %s", session.id, reason)
        session.state["feedback_error"] = reason
        return None

    result = parse_and_validate_feedback(json.dumps(raw_feedback, ensure_ascii=False))
    if result["status"] != "valid":
        reason = f"invalid feedback: {result.get('errors')}"
        logger.warning("Judge feedback invalid for session %s: %s", session.id, reason)
        session.state["feedback_error"] = reason
        return None

    feedback_json = result["data"]

    # Replace any dead resource links with live DuckDuckGo results.
    for resource in feedback_json.get("resources", []):
        link = resource.get("link", "")
        if not is_valid_and_reachable_url(link):
            print(f"[WARN] Invalid link: {link} – regenerating via DuckDuckGo...")
            new_resource = search_ddgs(resource.get("title", "interview tips"))
            resource["title"] = new_resource["title"]
            resource["link"] = new_resource["link"]

    feedback_json = deduplicate_resources(feedback_json)
    try:
        save_feedback_to_db(session, feedback_json)
    except Exception as exc:
        reason = f"feedback persist failed: {exc}"
        logger.error("Failed to persist feedback for session %s: %s", session.id, exc)
        session.state["feedback_error"] = reason
        return None

    session.state["feedback"] = feedback_json
    session.state["feedback_generated"] = True
    return feedback_json


def parse_and_validate_feedback(response_text: str) -> dict:
    """Extract and validate feedback JSON from the model response."""
    try:
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", response_text)
        json_str = match.group(1).strip() if match else response_text

        parsed = json.loads(json_str)
        Feedback.model_validate(parsed)
        return {"status": "valid", "data": parsed}
    except ValidationError as ve:
        return {"status": "invalid", "errors": ve.errors(), "raw": response_text}
    except Exception as exc:
        return {"status": "error", "message": str(exc), "raw": response_text}


def save_feedback_to_db(session, validated: dict) -> dict:
    """Store the feedback object under this session in Firestore."""
    return firestore_db.set_feedback(
        session.user_id,
        session.state.get("workflow_id"),
        session.id,
        Feedback(**validated),
    )


def is_valid_and_reachable_url(url: str) -> bool:
    try:
        response = requests.get(url, timeout=5)
        if response.status_code >= 400:
            return False
        content = response.text.lower()
        if "404" in content or "page not found" in content or "not available" in content:
            return False
        if len(content) < 500:  # avoid empty landing pages
            return False
        return True
    except Exception:
        return False


def deduplicate_resources(feedback_json: dict) -> dict:
    seen_links = set()
    unique_resources = []
    for resource in feedback_json.get("resources", []):
        link = resource.get("link")
        if link and link not in seen_links:
            unique_resources.append(resource)
            seen_links.add(link)
    feedback_json["resources"] = unique_resources
    return feedback_json


def search_ddgs(topic: str, max_results: int = 1, delay: int = 1) -> dict:
    """Use DuckDuckGo to get a real search-result link for a topic."""
    try:
        from duckduckgo_search import DDGS
    except Exception:
        return {
            "title": "5 Tips To Ace a Behavioral-Based Interview",
            "link": "https://jobs.gartner.com/life-at-gartner/your-career/5-tips-to-ace-a-behavioral-based-interview/",
        }

    try:
        with DDGS() as ddgs:
            for result in ddgs.text(topic, max_results=max_results):
                if result and result.get("href", "").startswith("http"):
                    return {"title": result.get("title", "Related resource"), "link": result["href"]}
        print(f"[Retry] No valid link found. Waiting {delay}s...")
        time.sleep(delay)
    except Exception as exc:
        print(f"[Retry] Error: {exc}. Waiting {delay}s...")
        time.sleep(delay)

    return {
        "title": "5 Tips To Ace a Behavioral-Based Interview",
        "link": "https://jobs.gartner.com/life-at-gartner/your-career/5-tips-to-ace-a-behavioral-based-interview/",
    }
