"""Per-user memory: aggregates weak/strong signals so the next session adapts.

No extra table — derives from data you already store (assessment attempts +
interview reports). Keeps the system honest: if you clear history, memory
clears too. Computation is cheap (last 8 attempts, in-memory counts).
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

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


# --------------------------------------------------------------------------- #
# Spaced repetition (T9) — persisted review state in drill_reviews
# --------------------------------------------------------------------------- #
# Gaps in days keyed by interval_index after a review: [1, 3, 7, 14].
# State machine (spec/arch T9):
#   - Seed (first sight of a weak skill): interval_index=0, due_at=now —
#     day-0 policy: the first drill is due immediately.
#   - good: interval_index = min(i + 1, len(INTERVALS) - 1);
#     due_at = now + INTERVALS[index] days (ladder 3 → 7 → 14 → 14); streak += 1.
#   - again: interval_index = 0; due_at = now + INTERVALS[0] day (due sooner);
#     streak = 0.
INTERVALS = [1, 3, 7, 14]


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value) -> datetime | None:
    """Parse stored timestamptz (ISO string or datetime) → aware UTC."""
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def ensure_reviews_for_user(user_id: str) -> None:
    """Seed review rows for weak skills that are not tracked yet.

    Day-0 policy: a never-reviewed weak skill is seeded with ``due_at = now``
    so the first drill shows up immediately. Existing rows are never re-seeded.
    Never raises — missing table / DB errors leave drills empty.
    """
    if not dbc.is_ready():
        return
    try:
        rows = dbc.select_where("drill_reviews", {"user_id": user_id}) or []
    except Exception:
        return
    tracked = {r.get("skill") for r in rows}
    digest = get_weakness_digest(user_id)
    missing = [s for s in (digest.get("weak") or []) if s and s not in tracked]
    if not missing:
        return
    now_iso = _utcnow().isoformat()
    payload = [
        {
            "user_id": user_id,
            "skill": skill,
            "interval_index": 0,
            "due_at": now_iso,
            "last_result": None,
            "streak": 0,
        }
        for skill in missing
    ]
    try:
        dbc.insert("drill_reviews", payload)
    except Exception:
        return


def _load_reviews(user_id: str) -> list[dict]:
    if not dbc.is_ready():
        return []
    try:
        return dbc.select_where("drill_reviews", {"user_id": user_id}) or []
    except Exception:
        return []


def _due_reviews(user_id: str) -> list[dict]:
    """Owned rows with due_at <= now, most overdue first."""
    now = _utcnow()
    due: list[tuple[datetime, dict]] = []
    for row in _load_reviews(user_id):
        ts = _parse_ts(row.get("due_at"))
        if ts is not None and ts <= now:
            due.append((ts, row))
    due.sort(key=lambda pair: pair[0])
    return [row for _, row in due]


def get_spaced_repetition_schedule(user_id: str) -> list[dict]:
    """Due review rows for the profile schedule (same due query as drills)."""
    ensure_reviews_for_user(user_id)
    schedule = []
    for row in _due_reviews(user_id):
        schedule.append({
            "skill": row.get("skill"),
            "due_at": row.get("due_at"),
            "due_in_days": 0,  # everything here is due now; due_at is the truth
            "interval_index": int(row.get("interval_index") or 0),
            "streak": int(row.get("streak") or 0),
            "reason": "needs work",
        })
    return schedule


def get_due_drills(user_id: str) -> list[dict]:
    """One-tap practice drills for reviews that are due now (due_at <= now).

    Template-based (no LLM call): deterministic, instant, and free. Each drill
    drops straight into the coaching practice flow as scenario + prompt.
    """
    ensure_reviews_for_user(user_id)
    drills = []
    for row in _due_reviews(user_id):
        skill = row.get("skill") or ""
        drills.append({
            "skill": skill,
            "due_at": row.get("due_at"),
            "due_in_days": 0,
            "interval_index": int(row.get("interval_index") or 0),
            "streak": int(row.get("streak") or 0),
            "last_result": row.get("last_result"),
            "reason": "needs work",
            "drill": {
                "scenario": "behavioral",
                "prompt": (
                    f"Describe a specific time you demonstrated {skill}. "
                    "Give the situation in one sentence, what YOU personally did, "
                    "and the measurable result."
                ),
                "tip": (
                    f"Interviewers probe {skill} with follow-ups about numbers and "
                    "your personal decisions — prepare one story with both."
                ),
            },
        })
    return drills


def record_review(user_id: str, skill: str, result: str) -> dict | None:
    """Apply one review to the spaced-repetition state machine.

    Returns the updated row, or None when the skill is unknown (neither
    tracked in drill_reviews nor in the caller's weakness digest) — the
    endpoint maps that to 404 so no garbage rows are created.

    ``result`` is "good" (advance) or "again" (reset); see INTERVALS above.
    """
    if result not in ("good", "again"):
        return None
    if not dbc.is_ready():
        return None

    rows = _load_reviews(user_id)
    row = next((r for r in rows if r.get("skill") == skill), None)

    if row is None:
        digest = get_weakness_digest(user_id)
        if skill not in (digest.get("weak") or []):
            return None  # unknown skill → 404 (arch: upsert only if tracked or weak)

    index = int((row or {}).get("interval_index") or 0)
    if index < 0 or index >= len(INTERVALS):
        index = 0
    streak = int((row or {}).get("streak") or 0)

    if result == "good":
        next_index = min(index + 1, len(INTERVALS) - 1)
        next_streak = streak + 1
    else:
        next_index = 0
        next_streak = 0

    now = _utcnow()
    values = {
        "interval_index": next_index,
        "due_at": (now + timedelta(days=INTERVALS[next_index])).isoformat(),
        "last_result": result,
        "streak": next_streak,
        "updated_at": now.isoformat(),
    }

    if row is None:
        inserted = dbc.insert(
            "drill_reviews", [{"user_id": user_id, "skill": skill, **values}]
        )
        if inserted:
            return inserted[0]
        return {"user_id": user_id, "skill": skill, **values}

    updated = dbc.update(
        "drill_reviews", {"user_id": user_id, "skill": skill}, values
    )
    return updated if updated is not None else {**row, **values}
