"""JD vs resume analysis, resume gap identification, and salary negotiation.

Localized to English from the interview-skills knowledge. Each function is a
pure, provider-agnostic pipeline producing a structured analysis a coach report
can render.
"""

from __future__ import annotations

from backend.ai import provider

JD_MATCH_SYSTEM = (
    "You are a senior technical recruiter and interview coach. Analyze the "
    "match between a job description and a candidate's resume. Return valid JSON only."
)

JD_MATCH_PROMPT = JD_MATCH_SCHEMA = """
Return JSON with exactly:
{
  "matched_skills": ["skill the resume clearly shows that the JD requires"],
  "gap_skills": ["skill JD requires but resume weak on or lacks"],
  "resume_weaknesses": ["resume sections/projects described too shallowly"],
  "overall_match_percent": 0-100,
  "summary": "one short paragraph"
}
"""


def analyze_match(job_description: str, resume_text: str) -> dict:
    user = (
        "JOB DESCRIPTION:\n"
        + job_description
        + "\n\nRESUME:\n"
        + resume_text
        + "\n\n"
        + JD_MATCH_PROMPT
    )
    data = provider.chat_json_strict(JD_MATCH_SYSTEM, user)
    if isinstance(data, dict) and "matched_skills" in data:
        return _coerce_match(data)
    from backend.ai.provider import extract_json
    return _coerce_match(extract_json(str(data)))


def _coerce_match(data: dict) -> dict:
    return {
        "matched_skills": data.get("matched_skills", []) or [],
        "gap_skills": data.get("gap_skills", []) or [],
        "resume_weaknesses": data.get("resume_weaknesses", []) or [],
        "overall_match_percent": data.get("overall_match_percent", 0) or 0,
        "summary": data.get("summary", "") or "",
    }


# --------------------------------------------------------------------------- #
# Question generation (mixes hard skills + project deep-dive + behavioral)
# --------------------------------------------------------------------------- #
QUESTION_SYSTEM = (
    "You are a senior interviewer at the target company. Generate role-specific "
    "mock interview questions from the JD and the candidate's resume. "
    "Return valid JSON only."
)

QUESTION_SCHEMA = """Return JSON, a list of exactly {count} objects:
{
 "skill_area" OR hard skill from JD OR "project" OR "behavioral" OR "reverse-question":
 [
   {
     "type": "technical" | "project" | "behavioral" | "reverse-question",
     "question": "the question text",
     "tests": "which JD requirement or resume item it probes",
     "difficulty": 1-5,
     "answer_hint": "3-5 sentence model-answer direction",
     "follow_up": "what interviewer asks next if answer is shallow",
     "tags": ["role", "skill"]
   }
 ]
}
"""


def generate_questions(
    job_description: str,
    resume_text: str,
    company_name: str,
    num_questions: int,
) -> list[dict]:
    profile = company_profiles.company_profile(company_name)
    style_note = f"{profile.get('style', '')} | focus: {profile.get('focus', 'inferred from JD')}"
    user = (
        f"Company: {company_name or 'unknown'}. Interview style: {style_note}\n\n"
        f"Generate exactly {num_questions} questions.\n"
        "Spread ~40% technical/hard skills from the JD, ~30% project depth from the "
        f"resume, ~20% behavioral/culture, ~10% reverse-question.\n\nQuestion schema: {QUESTION_SCHEMA}"
        f"\n\nJOB DESCRIPTION:\n{job_description}\n\nRESUME:\n{resume_text}"
    )
    data = provider.chat_json_strict(QUESTION_SYSTEM, user)
    items = data if isinstance(data, list) else (data.get("questions", []) if isinstance(data, dict) else [])
    if not items:
        return []
    return items[:num_questions]


# Import lazily to avoid circular import at module load.
from backend.career import company_profiles  # noqa: E402


# ---------------------------------------------------------------------------
# Salary negotiation
# ---------------------------------------------------------------------------
SALARY_SYSTEM = (
    "You are a calm, professional offer-negotiation coach. Produce a structured, "
    "English negotiation script the candidate can actually say. No threats, no "
    "aggressive templates. Keep it firm, composed, professional. Return JSON only."
)

SALARY_SCHEMA = """{
  "situation": {
    "known_conditions": ["...or empty"],
    "strongest_leverage": "...",
    "biggest_risk": "..."
  },
  "strategy": ["bullet strategies"],
  "scenarios": [
    {
      "name": "First asked expected salary",
      "say_this": "exact phrasing",
      "why": "negotiation logic",
      "avoid": "high-risk phrasing"
    },
    {
      "name": "Offer below expectation",
      "say_this": "exact phrasing",
      "why": "...",
      "avoid": "..."
    },
    {
      "name": "Holding other offers",
      "say_this": "exact phrasing",
      "why": "...",
      "avoid": "..."
    }
  ],
  "closing": {
    "keep_negotiating": "when",
    "acceptable_to_accept": "when",
    "polite_exit": "when"
  }
}"""


def salary_script(
    company: str,
    role: str,
    current_salary: str = "",
    target_range: str = "",
    has_offer: str = "",
) -> dict:
    user = (
        f"Target company: {company}, role: {role}.\n"
        f"Current salary: {current_salary or 'not provided'}.\n"
        f"Target range: {target_range or 'not provided'}.\n"
        f"Existing offer: {has_offer or 'not provided'}.\n\n"
        + SALARY_SCHEMA
    )
    data = provider.chat_json_strict(SALARY_SYSTEM, user)
    return data if isinstance(data, dict) else {"error": "salary script parse failed"}