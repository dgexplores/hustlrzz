"""Per-user memory: aggregates weak/strong signals so the next session adapts.

No extra table — derives from data you already store (assessment attempts +
interview reports). Keeps the system honest: if you clear history, memory
clears too. Computation is cheap (last 8 attempts, in-memory counts).
"""

from __future__ import annotations

from collections import Counter

from backend import db as dbc


def _top(counter: Counter, limit: int = 4) -> list[str]:
    return [skill for skill, _ in counter.most_common(limit) if skill]


def get_weakness_digest(user_id: str) -> dict:
    """Return {weak: [...], strong: [...], summary: str} for this user.

    Uses exponential decay (0.85^index) so recent sessions weigh more.
    Never raises — returns empty digest if DB unavailable or no history.
    """
    if not dbc.is_ready():
        return {"weak": [], "strong": [], "summary": ""}

    weak_counter: Counter = Counter()
    strong_counter: Counter = Counter()

    # Assessments: gap_skills / strength_skills from completed batches
    try:
        attempts = dbc.select_where("assessment_attempts", {"user_id": user_id}, order="created_at") or []
        for idx, attempt in enumerate(attempts[:8]):
            weight = 0.85 ** idx
            # New field names (v3) + legacy fallback
            for skill in (attempt.get("gap_skills") or []):
                if isinstance(skill, str) and skill.strip():
                    weak_counter[skill.strip().lower()] += 2 * weight
            for skill in (attempt.get("strength_skills") or []):
                if isinstance(skill, str) and skill.strip():
                    strong_counter[skill.strip().lower()] += 1 * weight
            # Fallback: derive from round_scores if gap fields empty
            if not attempt.get("gap_skills"):
                for score in (attempt.get("round_scores") or []):
                    key = str(score.get("key") or "").strip().lower()
                    if not key:
                        continue
                    if score.get("score", 100) < 60:
                        weak_counter[key] += 1 * weight
                    elif score.get("score", 0) >= 80:
                        strong_counter[key] += 1 * weight
    except Exception:
        pass

    # Interviews: improvements / strengths from judge reports (last 8)
    try:
        sessions = dbc.select_where("interview_sessions", {"user_id": user_id}, order="created_at") or []
        for idx, session in enumerate(sessions[:8]):
            weight = 0.85 ** idx
            report = session.get("report") if isinstance(session.get("report"), dict) else {}
            for item in (report.get("improvements") or [])[:4]:
                phrase = str(item).strip().lower()
                if len(phrase) > 6:
                    weak_counter[phrase.split()[0][:24]] += 1 * weight
            for item in (report.get("strengths") or [])[:3]:
                phrase = str(item).strip().lower()
                if len(phrase) > 6:
                    strong_counter[phrase.split()[0][:24]] += 1 * weight
    except Exception:
        pass

    weak = _top(weak_counter)
    strong = _top(strong_counter)

    # Remove overlap: if a skill appears in both, keep it as weak (needs work)
    weak_set = set(weak)
    strong = [s for s in strong if s not in weak_set]

    if not weak and not strong:
        return {"weak": [], "strong": [], "summary": ""}

    parts: list[str] = []
    if weak:
        parts.append(f"Focus more on: {', '.join(weak)}.")
    if strong:
        parts.append(f"Keep leveraging: {', '.join(strong)}.")
    summary = " ".join(parts)
    return {"weak": weak, "strong": strong, "summary": summary}


def get_weakness_context(user_id: str, max_chars: int = 900) -> str:
    """Plain-text block ready to inject into LLM prompts."""
    digest = get_weakness_digest(user_id)
    if not digest["summary"]:
        return ""
    # Keep prompt injection short and explicit
    lines = ["CANDIDATE MEMORY — derived from your recent practice (last sessions):"]
    if digest["weak"]:
        lines.append(f"- Needs work: {', '.join(digest['weak'])}")
    if digest["strong"]:
        lines.append(f"- Strengths to keep: {', '.join(digest['strong'])}")
    lines.append("Use this to bias follow-ups and question choice toward the weak areas without repeating the same question verbatim.")
    text = "\n".join(lines)
    return text[:max_chars]


def format_memory_for_rag(user_id: str) -> str:
    """One-paragraph ingest for RAG after a session completes."""
    digest = get_weakness_digest(user_id)
    if not digest["summary"]:
        return ""
    return f"Practice memory snapshot: {digest['summary']}"


def get_skill_trends(user_id: str, limit: int = 12) -> list[dict]:
    """Return time-series of scores for Progress chart.

    Each point: {date, score, weak, strong, type}. Sorted oldest→newest.
    Never raises.
    """
    if not dbc.is_ready():
        return []
    points: list[dict] = []
    try:
        attempts = dbc.select_where("assessment_attempts", {"user_id": user_id}, order="created_at") or []
        for attempt in attempts[:limit]:
            score = attempt.get("total_percent")
            if isinstance(score, (int, float)):
                points.append({
                    "date": str(attempt.get("created_at", ""))[:10],
                    "score": int(score),
                    "type": "assessment",
                    "label": f"{attempt.get('role','')[:18]} {attempt.get('band','')}",
                })
    except Exception:
        pass
    try:
        sessions = dbc.select_where("interview_sessions", {"user_id": user_id}, order="created_at") or []
        for session in sessions[:limit]:
            report = session.get("report") if isinstance(session.get("report"), dict) else {}
            scores = report.get("scores") or {}
            # Average of report scores if available
            if isinstance(scores, dict) and scores:
                vals = [v for v in scores.values() if isinstance(v, (int, float))]
                if vals:
                    points.append({
                        "date": str(session.get("created_at", ""))[:10],
                        "score": int(sum(vals) / len(vals)),
                        "type": "interview",
                        "label": "interview",
                    })
    except Exception:
        pass
    # Sort oldest first for chart
    try:
        points.sort(key=lambda p: p["date"])
    except Exception:
        pass
    return points[-12:]


def get_spaced_repetition_schedule(user_id: str) -> list[dict]:
    """Return next 3 skills to revisit with due dates (simple spaced repetition)."""
    digest = get_weakness_digest(user_id)
    weak = digest.get("weak") or []
    if not weak:
        return []
    # Simple schedule: most-weak first, due in 1, 3, 7 days
    intervals = [1, 3, 7]
    schedule = []
    for idx, skill in enumerate(weak[:3]):
        schedule.append({"skill": skill, "due_in_days": intervals[idx], "reason": "needs work"})
    return schedule
