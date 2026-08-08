"""Interview preparation workflow (English).

Pipeline:
  1. summarize candidate profile          (LLM)
  2. web-search real industry questions   (DuckDuckGo, free)  [parallel with 1]
  3. rank/generate personalized questions (LLM, exact count)
  4. generate model answers               (LLM)
  5. company match analysis               (LLM)

Results are persisted to Supabase so the mock-interview stage can consume them.
All prompts are English.
"""

from __future__ import annotations

import asyncio
import json
import secrets
import string
import time
import traceback
from typing import Optional

from backend.ai import provider
from backend.career import company_profiles

PERSONAL_SUMMARY_SYSTEM = (
    "You are a recruiting coach. Turn the candidate's raw materials into a crisp, "
    "structured English profile used to design interview questions. Return JSON only."
)

QUESTION_SYSTEM = (
    "You are a senior interviewer. Based on the candidate profile summary and a set "
    "of real questions people get asked for this role, produce personalized mock "
    "interview questions. Return JSON only."
)

ANSWER_SYSTEM = (
    "You are an interview coach. Write strong, realistic model answers for each "
    "question, matched to this candidate's background. Keep them conversational, "
    "structure-first (conclusion -> reasoning -> concrete example -> result). "
    "Return JSON only."
)


def generate_session_id() -> str:
    import secrets
    import string

    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(20))


def _search_web(job_title: str, job_description: str, max_results: int = 8) -> list[dict]:
    queries = [
        f"{job_title} interview questions",
        f"{job_title} common interview questions and answers",
        f"{job_title} behavioral interview questions",
        f"{job_title} technical interview questions",
    ]
    results: list[dict] = []
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            for query in queries:
                try:
                    for item in ddgs.text(query, max_results=min(max_results, 5)):
                        results.append({
                            "title": item.get("title", ""),
                            "url": item.get("href", ""),
                            "snippet": item.get("body", ""),
                            "query": query,
                        })
                except Exception:
                    continue
    except Exception as exc:
        print(f"[WARN] DuckDuckGo search failed: {exc}")
    return results


def _organize_search(job_title: str, job_description: str, results: list[dict]) -> dict:
    """Pass raw web results to the LLM so leftovers become structured industry FAQs."""
    search_system = (
        "You are a recruiting researcher. Turn these raw, real interview-question search "
        "results into a structured industry FAQ set. Return JSON: "
        '{"real_questions": [...], "interview_process": {...}}'
    )
    try:
        return provider.chat_json_strict(
            search_system,
            f"Role: {job_title}\nJD:\n{job_description}\n\nRaw results:\n"
            + json.dumps(results[:60], ensure_ascii=False),
        )
    except Exception as exc:
        print(f"[WARN] Search organization failed: {exc}")
        return {"real_questions": [], "interview_process": {}}


async def run_preparation_workflow(
    user_id: str,
    resume_text: str,
    job_description: str,
    company_name: str = "",
    linkedin_link: str = "",
    github_link: str = "",
    portfolio_link: str = "",
    additional_info: str = "",
    num_questions: int = 50,
    session_id: Optional[str] = None,
) -> dict:
    workflow_id = session_id or generate_session_id()

    if not provider.is_configured():
        return {
            "success": False,
            "error": "AI not configured. Set GROQ_API_KEY or GEMINI_API_KEY in backend/.env.",
            "session_id": workflow_id,
        }

    try:
        job_title = job_description.split("\n")[0].strip()[:80] or "this role"
        t0 = time.time()

        base_input = (
            f"Company: {company_name or 'unknown'}\n"
            f"LinkedIn: {linkedin_link}\nGitHub: {github_link}\nPortfolio: {portfolio_link}\n"
            f"Additional info: {additional_info}\n\n"
            f"Number of questions requested: {num_questions}\n\n"
            f"RESUME:\n{resume_text}\n\nJOB DESCRIPTION:\n{job_description}"
        )

        # Step 1 (parallel): summarize + web-seek real questions.
        summary_task = asyncio.create_task(
            asyncio.to_thread(provider.chat_json, PERSONAL_SUMMARY_SYSTEM, base_input)
        )
        search_task = asyncio.create_task(
            asyncio.to_thread(lambda: _organize_search(job_title, job_description, _search_web(job_title, job_description)))
        )
        personal_summary, industry_faqs = await asyncio.gather(summary_task, search_task)

        # Step 2+3 (parallel): match analysis + question generation in one call.
        def _do_questions():
            quser = (
                f"Company: {company_name or 'unknown'}\n"
                f"Interview style: {company_profiles.company_profile(company_name).get('style', '')}\n"
                f"Personal summary:\n{json.dumps(personal_summary, ensure_ascii=False)}\n"
                f"Industry FAQs:\n{json.dumps(industry_faqs, ensure_ascii=False)}\n\n"
                f"Generate exactly {num_questions} personalized questions as the JSON schema: "
                '[{"type":"technical|project|behavioral|reverse-question","question":"...",'
                '"tests":"...","difficulty":1-5,"answer_hint":"...","follow_up":"...","tags":[]}]\n\n'
                "Also produce a short JD-vs-resume match summary. Return JSON:\n"
                '{"questions": [...], "match": {"matched_skills":[],"gap_skills":[],'
                '"resume_weaknesses":[],"overall_match_percent":0,"summary":""}}'
            )
            data = provider.chat_json_strict(QUESTION_SYSTEM, quser)
            if not isinstance(data, dict):
                return [], {}
            questions = data.get("questions", [])
            m = data.get("match", {}) if isinstance(data.get("match"), dict) else {}
            if not isinstance(questions, list):
                questions = []
            return questions[:num_questions], {
                "matched_skills": m.get("matched_skills", []) or [],
                "gap_skills": m.get("gap_skills", []) or [],
                "resume_weaknesses": m.get("resume_weaknesses", []) or [],
                "overall_match_percent": m.get("overall_match_percent", 0) or 0,
                "summary": m.get("summary", "") or "",
            }

        question_task = asyncio.create_task(asyncio.to_thread(_do_questions))
        questions, match = await question_task

        # Step 4: model answers.
        answers_user = (
            f"Profile:\n{json.dumps(personal_summary, ensure_ascii=False)}\n\n"
            f"Questions:\n{json.dumps(questions, ensure_ascii=False)}\n\n"
            'Return JSON list aligned to questions: [{"question":"...","answer":"...","tags":[]}]'
        )
        try:
            answers_data = provider.chat_json_strict(ANSWER_SYSTEM, answers_user)
            if not isinstance(answers_data, list):
                answers_data = answers_data.get("answers", []) if isinstance(answers_data, dict) else []
            answers_data = answers_data[: len(questions)]
        except Exception as exc:
            print(f"[WARN] answer generation failed: {exc}")
            answers_data = []

        return {
            "success": True,
            "session_id": workflow_id,
            "workflow_id": workflow_id,
            "completed_agents": ["resume_summarizer", "interview_questions_searcher", "question_generator", "answer_generator"],
            "processing_time": round(time.time() - t0, 2),
            "company_match": match,
            "industry_faqs": industry_faqs,
            "questions": questions,
            "answers": answers_data,
        }
    except Exception as exc:
        print(traceback.format_exc())
        return {"success": False, "error": str(exc), "session_id": workflow_id}