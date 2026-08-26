"""Assessment rounds: aptitude, technical MCQ and situational judgment.

Mirrors how large companies screen candidates before interviews: a timed,
multi-round online assessment. Question sets are generated per role/company/
level, the answer key never leaves the server until a round is submitted, and
each attempt is scored round-by-round into an aggregate readiness report.
"""

from __future__ import annotations

import secrets

from backend.ai import provider
from backend.career import company_profiles
from backend import db as dbc
from backend.obs import log

TABLE = "assessment_attempts"

ROUND_SPECS: list[dict] = [
    {"key": "aptitude", "name": "Aptitude & Reasoning", "count": 8,
     "mix": "quantitative comparison, number series, logical puzzles, data interpretation, verbal reasoning"},
    {"key": "technical", "name": "Role Technical Screen", "count": 6,
     "mix": "core concepts, practical application, debugging intuition for the target role"},
    {"key": "judgment", "name": "Situational Judgment", "count": 4,
     "mix": "workplace dilemmas, prioritization, collaboration and ownership scenarios"},
]

LEVELS = {"fresher", "mid", "senior"}

_GENERATION_SYSTEM = (
    "You are an assessment designer at a top technology company. Write a timed "
    "multiple-choice screening battery. Questions must be self-contained, have "
    "exactly four options with exactly one clearly correct answer, plausible "
    "distractors, and a one-to-two sentence explanation. Vary difficulty from "
    "warm-up to stretch. Never make options like 'all of the above'. "
    "Return JSON only."
)

_GENERATION_SCHEMA = """{
 "rounds": [
   {"key":"aptitude|technical|judgment",
    "questions":[{"prompt":"","options":["","","",""],"answer_index":0-3,"skill":"","explanation":""}]}
 ]
}"""


def _sanitize_round(round_data: dict) -> dict:
    questions = []
    for index, question in enumerate(round_data.get("questions", [])):
        questions.append({
            "id": f"q{index + 1}",
            "prompt": question.get("prompt", ""),
            "options": question.get("options", []),
        })
    return {"key": round_data.get("key", ""), "name": round_data.get("name", ""), "questions": questions}


def _validate_generated(data) -> list[dict] | None:
    if not isinstance(data, dict):
        return None
    rounds = data.get("rounds")
    if not isinstance(rounds, list):
        return None
    by_key: dict[str, dict] = {}
    for incoming in rounds:
        if not isinstance(incoming, dict):
            continue
        key = str(incoming.get("key", ""))
        spec = next((s for s in ROUND_SPECS if s["key"] == key), None)
        if not spec:
            continue
        questions: list[dict] = []
        raw_questions = incoming.get("questions", []) if isinstance(incoming.get("questions"), list) else []
        for question in raw_questions:
            if not isinstance(question, dict):
                continue
            options = [str(opt)[:300] for opt in (question.get("options") or [])][:4]
            try:
                answer_index = int(question.get("answer_index"))
            except (TypeError, ValueError):
                continue
            prompt = str(question.get("prompt") or "").strip()
            if len(options) != 4 or not (0 <= answer_index <= 3) or len(prompt) < 8:
                continue
            questions.append({
                "prompt": prompt[:1200],
                "options": options,
                "answer_index": answer_index,
                "skill": str(question.get("skill") or "general")[:60],
                "explanation": str(question.get("explanation") or "").strip()[:600],
            })
        if questions:
            by_key[key] = {
                "key": key,
                "name": spec["name"],
                "time_limit_seconds": spec["count"] * 60,
                "questions": questions[: spec["count"]],
            }
    missing = [spec["key"] for spec in ROUND_SPECS if spec["key"] not in by_key]
    return list(by_key.values()) if not missing else None


def _generate_rounds(role: str, company: str, level: str) -> list[dict]:
    profile = company_profiles.company_profile(company)
    style_note = profile.get("style", "")
    user = (
        f"Target role: {role}\nCompany style: {style_note or 'general technology company'}\n"
        f"Seniority level: {level}\n\n"
        "Generate these rounds:\n"
        + "\n".join(
            f'- key "{spec["key"]}": exactly {spec["count"]} questions mixing {spec["mix"]}'
            for spec in ROUND_SPECS
        )
        + f"\n\nCalibrate technical difficulty to {level} level."
        + ("\nReference the company's real interview style when choosing technical topics." if company else "")
        + "\n\nSchema: " + _GENERATION_SCHEMA
    )
    data = provider.chat_json_strict(_GENERATION_SYSTEM, user)
    return _validate_generated(data) or []


def _grade_round(round_state: dict, responses: dict) -> dict:
    total = len(round_state["questions"])
    correct = 0
    review: list[dict] = []
    skills_right: list[str] = []
    skills_wrong: list[str] = []
    for index, question in enumerate(round_state["questions"], start=1):
        qid = f"q{index}"
        chosen = responses.get(qid)
        try:
            chosen_index = int(chosen)
        except (TypeError, ValueError):
            chosen_index = -1
        is_correct = chosen_index == question["answer_index"]
        correct += 1 if is_correct else 0
        bucket = skills_right if is_correct else skills_wrong
        bucket.append(question.get("skill", "general"))
        review.append({
            "qid": qid,
            "prompt": question["prompt"],
            "chosen_index": chosen_index,
            "chosen_text": question["options"][chosen_index] if 0 <= chosen_index < len(question["options"]) else "",
            "correct_index": question["answer_index"],
            "correct_text": question["options"][question["answer_index"]],
            "correct": is_correct,
            "explanation": question.get("explanation", ""),
            "skill": question.get("skill", "general"),
        })
    score = round((correct / total) * 100) if total else 0
    return {
        "correct": correct,
        "total": total,
        "score": score,
        "review": review,
        "skills_right": skills_right,
        "skills_wrong": skills_wrong,
    }


def _band(percent: int) -> tuple[str, str]:
    if percent >= 85:
        return "Interview-ready", "Screen performance mirrors strong candidates. Move on to live interview practice."
    if percent >= 70:
        return "Solid", "A few targeted drills away from a comfortable pass. Review the misses below."
    if percent >= 50:
        return "Developing", "Fundamentals are forming. Rebuild speed on the weak sections before retesting."
    return "Foundational", "Focus on basics section-by-section, then retake in a few days."


def _top_skills(skills: list[str], limit: int = 4) -> list[str]:
    counts: dict[str, int] = {}
    for skill in skills:
        counts[skill] = counts.get(skill, 0) + 1
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [skill for skill, _ in ordered[:limit]]


async def start_attempt(user_id: str, role: str, company: str, level: str) -> dict:
    role = (role or "").strip()[:200]
    company = (company or "").strip()[:160]
    level = level if level in LEVELS else "mid"
    if not role:
        raise ValueError("Target role is required.")
    rounds = await __import__("asyncio").to_thread(_generate_rounds, role, company, level)
    attempt_id = secrets.token_urlsafe(16)
    dbc.insert(TABLE, [{
        "attempt_id": attempt_id,
        "user_id": user_id,
        "role": role,
        "company": company,
        "level": level,
        "rounds": rounds,
        "current_round": 0,
        "round_scores": [],
        "status": "in_progress",
    }])
    first = rounds[0]
    return {"attempt_id": attempt_id, "round_index": 0, "round": _sanitize_round(first), "round_count": len(rounds)}


def _load_owned(attempt_id: str, user_id: str) -> dict | None:
    rows = dbc.select_where(TABLE, {"attempt_id": attempt_id}) or []
    owned = [row for row in rows if row.get("user_id") == user_id]
    return owned[0] if owned else None


def submit_round(user_id: str, attempt_id: str, round_index: int, responses: dict) -> dict:
    attempt = _load_owned(attempt_id, user_id)
    if not attempt:
        raise LookupError("Assessment attempt not found.")
    if attempt.get("status") != "in_progress":
        return {"completed": True, "report": _report_from_attempt(attempt)}
    rounds = attempt.get("rounds") or []
    current = int(attempt.get("current_round") or 0)
    if round_index != current:
        raise ValueError("Round out of order.")
    state = rounds[current]
    graded = _grade_round(state, responses if isinstance(responses, dict) else {})
    scores = list(attempt.get("round_scores") or [])
    scores.append({
        "key": state["key"], "name": state["name"],
        "score": graded["score"], "correct": graded["correct"], "total": graded["total"],
    })
    updates: dict = {}
    result_payload: dict = {
        "round_key": state["key"],
        "score": graded["score"],
        "correct": graded["correct"],
        "total": graded["total"],
        "review": graded["review"],
    }
    if current + 1 < len(rounds):
        nxt = rounds[current + 1]
        updates["current_round"] = current + 1
        dbc.update(TABLE, {"attempt_id": attempt_id}, updates)
        return {**result_payload, "completed": False,
                "next_round_index": current + 1,
                "next_round": _sanitize_round(nxt)}
    total_percent = round(sum(s["score"] for s in scores) / max(1, len(scores)))
    band, recommendation = _band(total_percent)
    updates.update({"status": "completed", "total_percent": total_percent, "band": band})
    dbc.update(TABLE, {"attempt_id": attempt_id}, updates)
    all_right: list[str] = list(graded["skills_right"])
    all_wrong: list[str] = list(graded["skills_wrong"])
    strength_skills = _top_skills(all_right)
    gap_skills = _top_skills([s for s in all_wrong if s not in set(strength_skills)])
    return {**result_payload, "completed": True,
            "report": {"round_scores": scores, "total_percent": total_percent,
                       "band": band, "recommendation": recommendation,
                       "strength_skills": strength_skills, "gap_skills": gap_skills}}


def _report_from_attempt(attempt: dict) -> dict:
    scores = attempt.get("round_scores") or []
    band = attempt.get("band") or _band(int(attempt.get("total_percent") or 0))[0]
    return {
        "round_scores": scores,
        "total_percent": attempt.get("total_percent") or 0,
        "band": band,
        "recommendation": _band(int(attempt.get("total_percent") or 0))[1],
        "strength_skills": [],
        "gap_skills": [],
    }


def get_attempt(user_id: str, attempt_id: str) -> dict | None:
    attempt = _load_owned(attempt_id, user_id)
    if not attempt:
        return None
    rounds = attempt.get("rounds") or []
    current = int(attempt.get("current_round") or 0)
    payload: dict = {
        "attempt_id": attempt_id,
        "role": attempt.get("role"),
        "company": attempt.get("company"),
        "status": attempt.get("status"),
        "round_count": len(rounds),
        "round_scores": attempt.get("round_scores") or [],
        "total_percent": attempt.get("total_percent"),
        "band": attempt.get("band"),
    }
    if attempt.get("status") == "in_progress" and current < len(rounds):
        payload["round_index"] = current
        payload["round"] = _sanitize_round(rounds[current])
    elif attempt.get("status") == "completed":
        payload["report"] = _report_from_attempt(attempt)
    return payload


def list_attempts(user_id: str) -> list[dict]:
    rows = dbc.select_where(TABLE, {"user_id": user_id}, order="created_at") or []
    return [{
        "attempt_id": row.get("attempt_id"),
        "role": row.get("role"),
        "company": row.get("company"),
        "level": row.get("level"),
        "status": row.get("status"),
        "total_percent": row.get("total_percent"),
        "band": row.get("band"),
        "created_at": row.get("created_at"),
    } for row in rows]


def log_generation_failure(exc: Exception) -> None:
    log.warning("assessment generation failed: %s", exc)
