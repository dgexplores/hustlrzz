"""Live AI interviewer (WebSocket session) and interview judge.

The interviewer keeps a running transcript and can be switched to a
"single-exchange" coach that responds to each candidate message. On session
end, the judge produces a structured coaching report.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone

from backend.ai import provider

INTERVIEWER_SYSTEM = (
    "You are a professional interviewer at this company. Interview the candidate "
    "in real time. Ask the prepared questions one at a time. Listen to each answer, "
    "then either give a short reaction and move to the next question, or ask one "
    "follow-up if the answer was shallow. Keep tone warm but real. Never dump all "
    "questions at once. You are conducting an English interview."
)


def build_interviewer_system(
    company: str,
    role: str,
    questions: list[dict],
    duration_minutes: int,
) -> str:
    q_text = "\n".join(
        f"- [{q.get('type', 'question')}] {q.get('question', '')}"
        for q in (questions or [])
    )
    return (
        INTERVIEWER_SYSTEM
        + f"\n\nCompany: {company or 'unknown'}\nRole: {role or 'unknown'}\n"
        f"Session duration: {duration_minutes} minutes.\n\nPREPARED QUESTIONS:\n{q_text}\n\n"
        "Use the prepared questions in order. About midway, your follow-up can go deeper.\n"
        "RESPONSE FORMAT: return JSON {\"question\":\"...\",\"message\":\"...\",\"done\":false|true}."
    )


def interviewer_turn(system: str, transcript: list[dict], candidate_message: str, retrieval_context: str = "") -> dict:
    messages = _transcript_to_messages(transcript)
    messages.append({"role": "user", "content": candidate_message})
    system_messages = [{"role": "system", "content": system}]
    combined = system_messages + messages
    # Build a prompt from the whole context: multi-turn reasoning via provider.chat_json.
    context = "\n".join(
        f"{'Candidate' if m['role'] == 'user' else 'Interviewer'}: {m['content']}"
        for m in messages
    )
    grounded_system = system
    if retrieval_context:
        grounded_system += (
            "\n\nCANDIDATE-OWNED REFERENCE CONTEXT:\n"
            + retrieval_context
            + "\nUse this only when it is relevant. Do not invent facts beyond it."
        )
    raw = provider.chat("Follow the interviewer system below and output the JSON format.\n\n" + grounded_system, context + "\n\nReply in the JSON response format.")
    data = provider.extract_json(raw)
    if not isinstance(data, dict) or "message" not in data:
        return {"message": "Could you say that again?", "reflection": False}
    return data


def _transcript_to_messages(transcript: list[dict]) -> list[dict]:
    msgs: list[dict] = []
    for turn in transcript:
        role = "user" if turn.get("from") == "candidate" else "assistant"
        msgs.append({"role": role, "content": turn.get("text", "")})
    return msgs


def judge_report(system_path: list[dict], transcript: list[dict], resume_text: str, job_description: str) -> dict:
    """Score a completed interview transcript into a coaching report."""
    judge_system = (
        "You are a senior interview coach. Review the interview transcript below and "
        "score the candidate with evidence. Return JSON only."
    )
    transcript_txt = "\n".join(
        f"{t.get('from', '')}: {t.get('text', '')}" for t in transcript
    )
    user = (
        "JUDGE THE FOLLOWING INTERVIEW.\n\nQuestions this role:\n"
        f"{job_description}\n\nCandidate background:\n{questions_text(system)}\n\n"
        "TRANSCRIPT:\n"
        + transcript_txt
        + "\n\nPERFORMANCE AREAS: communication, structure, depth, behavioral_star, "
        "technical_accuracy, confidence. For each give score 1-100 and a short note. Also "
        "give one strengths list, one improvements list, a STAR example, and a verdict. "
        'JSON: {"scores":{"communication":0,...},"strengths":[],"improvements":[],"summary":"","verdict":"..."}.'
    )
    data = provider.chat_json_strict(judge_system, user)
    return data if isinstance(data, dict) else {}


def questions_text(system: str) -> str:
    try:
        data = json.loads(system)
        return "\n".join(
            f"- {q.get('question', '')}" for q in data.get("questions", [])
        ) or system
    except Exception:
        return system


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
