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

    Never raises — returns empty digest if DB unavailable or no history.
    """
    if not dbc.is_ready():
        return {"weak": [], "strong": [], "summary": ""}

    weak_counter: Counter = Counter()
    strong_counter: Counter = Counter()

    # Assessments: gap_skills / strength_skills from completed batches
    try:
        attempts = dbc.select_where("assessment_attempts", {"user_id": user_id}, order="created_at") or []
        for attempt in attempts[:8]:
            # New field names (v3) + legacy fallback
            for skill in (attempt.get("gap_skills") or []):
                if isinstance(skill, str) and skill.strip():
                    weak_counter[skill.strip().lower()] += 2
            for skill in (attempt.get("strength_skills") or []):
                if isinstance(skill, str) and skill.strip():
                    strong_counter[skill.strip().lower()] += 1
            # Fallback: derive from round_scores if gap fields empty
            if not attempt.get("gap_skills"):
                for score in (attempt.get("round_scores") or []):
                    key = str(score.get("key") or "").strip().lower()
                    if not key:
                        continue
                    if score.get("score", 100) < 60:
                        weak_counter[key] += 1
                    elif score.get("score", 0) >= 80:
                        strong_counter[key] += 1
    except Exception:
        pass

    # Interviews: improvements / strengths from judge reports (last 8)
    try:
        sessions = dbc.select_where("interview_sessions", {"user_id": user_id}, order="created_at") or []
        for session in sessions[:8]:
            report = session.get("report") if isinstance(session.get("report"), dict) else {}
            for item in (report.get("improvements") or [])[:4]:
                # Extract leading skill-ish phrase (first 2-3 words lowercased)
                phrase = str(item).strip().lower()
                if len(phrase) > 6:
                    # Keep short tag, e.g., "structure", "depth", "communication"
                    weak_counter[phrase.split()[0][:24]] += 1
            for item in (report.get("strengths") or [])[:3]:
                phrase = str(item).strip().lower()
                if len(phrase) > 6:
                    strong_counter[phrase.split()[0][:24]] += 1
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
