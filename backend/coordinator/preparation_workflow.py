"""Interview preparation workflow — powered by Groq (free, no quota wall).

Pipeline (mirrors the original agent pipeline, minus Google ADK):

    1. summarize candidate profile           (Groq LLM)
    1. search real industry interview Qs     (DuckDuckGo web search + Groq LLM)  [parallel with 1]
    2. generate personalized questions       (Groq LLM, exact count enforced)
    3. generate model answers                (Groq LLM)

Results are persisted to Firestore for the mock interview and feedback stages.
"""

import asyncio
import json
import secrets
import string
import time
import traceback
from typing import Optional

from backend.agents.answer_generator.prompt import ANSWER_GENERATION_PROMPT
from backend.agents.question_generator.prompt import QUESTION_GENERATION_PROMPT
from backend.agents.search.prompt import SEARCH_PROMPT
from backend.agents.summarizer.prompt import SUMMARIZER_PROMPT
from backend.config import set_google_cloud_env_vars
from backend.tools import groq_provider

# Load environment variables
set_google_cloud_env_vars()


def generate_session_id(input_data: str = ""):
    """Generate a random session ID similar to Firestore document IDs."""
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(20))


def extract_json_from_response(response_text: str) -> dict:
    """Extract JSON from LLM response text that may contain markdown code blocks."""
    if not response_text:
        return {}
    try:
        import re

        markdown_json_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
        markdown_matches = re.findall(markdown_json_pattern, response_text)
        if markdown_matches:
            return json.loads(markdown_matches[0].strip())
        return json.loads(response_text)
    except json.JSONDecodeError:
        try:
            start_index = response_text.find("{")
            end_index = response_text.rfind("}") + 1
            if 0 <= start_index < end_index:
                return json.loads(response_text[start_index:end_index])
        except Exception as exc:
            return {"error": f"Error parsing response: {str(exc)}", "raw_response": response_text}
    except Exception as exc:
        return {"error": f"Error parsing response: {str(exc)}", "raw_response": response_text}


def _search_web(job_title: str, job_description: str, max_results: int = 8) -> list:
    """Gather real interview questions for the role via DuckDuckGo (free)."""
    queries = [
        f"{job_title} interview questions",
        f"{job_title} common interview questions and answers",
        f"{job_title} interview experience candidates",
        f"{job_title} behavioral interview questions",
        f"{job_title} technical interview questions",
    ]
    results: list = []
    try:
        from duckduckgo_search import DDGS

        with DDGS() as ddgs:
            for query in queries:
                try:
                    for item in ddgs.text(query, max_results=max_results):
                        results.append(
                            {
                                "title": item.get("title", ""),
                                "url": item.get("href", ""),
                                "snippet": item.get("body", ""),
                                "query": query,
                            }
                        )
                except Exception:
                    continue
    except Exception as exc:
        print(f"[WARN] DuckDuckGo search failed: {exc}")
    return results


def _format_prompt(template: str, **replacements) -> str:
    """Safely substitute {placeholders} in a prompt (templates contain braces)."""
    prompt = template
    for key, value in replacements.items():
        prompt = prompt.replace("{" + key + "}", str(value))
    return prompt


async def run_preparation_workflow(
    user_id: str,
    resume_text: str,
    job_description: str,
    linkedin_link: str = "",
    github_link: str = "",
    portfolio_link: str = "",
    additional_info: str = "",
    num_questions: int = 50,
    session_id: Optional[str] = None,
):
    """
    Run the complete interview preparation workflow.

    Returns:
        dict: workflow result with session_id (== workflow_id) and agent outputs.
    """
    workflow_id = session_id

    try:
        if not groq_provider.is_configured():
            return {
                "success": False,
                "error": "GROQ_API_KEY is not set. Add it to backend/.env (see backend/.env.example).",
                "user_id": user_id,
                "session_id": session_id,
            }

        if not session_id:
            input_signature = f"{user_id}{resume_text[:100]}{job_description[:100]}{time.time()}"
            session_id = generate_session_id(input_signature)
        workflow_id = session_id

        # Optional enrichment: GitHub + portfolio analysis (kept from original).
        github_analysis_result = ""
        if github_link and github_link.strip():
            try:
                from backend.services.github import GitHubAnalyzer

                github_analysis_result = GitHubAnalyzer().get_github_summary_for_workflow(github_link)
                print(f"GitHub analysis completed: {len(github_analysis_result)} characters")
            except Exception as exc:
                print(f"[WARN] GitHub analysis failed: {exc}")

        portfolio_content = ""
        if portfolio_link and portfolio_link.strip():
            try:
                from backend.services.portfolio.portfolio_analyzer import analyze_portfolio_url

                portfolio_content = await analyze_portfolio_url(portfolio_link.strip())
                print(f"Portfolio analysis completed. Content length: {len(portfolio_content)}")
            except Exception as exc:
                print(f"[WARN] Portfolio analysis failed for URL {portfolio_link}: {exc}")

        summarizer_input = f"""
        ##CRITICAL WORKFLOW CONFIGURATION
        Number of questions to generate: {num_questions}
        IMPORTANT: This workflow MUST generate exactly {num_questions} interview questions

        ## Resume Content
        {resume_text}

        ## LinkedIn URL
        {linkedin_link}

        ## GitHub Analysis Result
        {github_analysis_result}

        ## Portfolio Content
        {portfolio_content}

        ## Additional Information
        {additional_info}

        ## Job Description
        {job_description}

        ## REMINDER: EXACT QUESTION COUNT REQUIRED
        The question generator MUST produce exactly {num_questions} questions.
        Number of questions to generate: {num_questions}
        """

        completed_agents = []

        # Step 1 (parallel): summarize the profile + search real industry questions.
        print("=== Step 1: summarizing profile & searching industry FAQs (parallel) ===")
        summary_task = asyncio.create_task(
            asyncio.to_thread(groq_provider.chat_json, SUMMARIZER_PROMPT, summarizer_input)
        )
        search_task = asyncio.create_task(
            asyncio.to_thread(_run_search_agent, job_description)
        )
        personal_summary, industry_faqs = await asyncio.gather(summary_task, search_task)
        completed_agents.append("resume_summarizer")
        completed_agents.append("interview_questions_searcher")
        print("=== Step 1 complete ===")

        if not personal_summary or "error" in personal_summary:
            raise RuntimeError(f"Resume summarizer failed: {personal_summary}")

        # Step 2: generate personalized questions.
        print("=== Step 2: generating interview questions ===")
        questions_prompt = _format_prompt(
            QUESTION_GENERATION_PROMPT,
            personal_summary=json.dumps(personal_summary, ensure_ascii=False),
            industry_faqs=json.dumps(industry_faqs, ensure_ascii=False),
        )
        questions_data = await asyncio.to_thread(
            groq_provider.chat_json, questions_prompt,
            "Generate the interview questions for this candidate exactly as specified above.",
        )
        if not isinstance(questions_data, list):
            questions_data = questions_data.get("questions", []) if isinstance(questions_data, dict) else []
        completed_agents.append("question_generator")
        print(f"=== Step 2 complete ({len(questions_data)} questions) ===")

        # Step 3: generate model answers.
        print("=== Step 3: generating model answers ===")
        answers_prompt = _format_prompt(
            ANSWER_GENERATION_PROMPT,
            personal_summary=json.dumps(personal_summary, ensure_ascii=False),
            questions_data=json.dumps(questions_data, ensure_ascii=False),
        )
        answers_data = await asyncio.to_thread(
            groq_provider.chat_json, answers_prompt,
            "Generate the personalized answers for the questions exactly as specified above.",
        )
        if not isinstance(answers_data, list):
            answers_data = answers_data.get("answers", []) if isinstance(answers_data, dict) else []
        completed_agents.append("answer_generator")
        print(f"=== Step 3 complete ({len(answers_data)} answers) ===")

        session_state_updates = {
            "personal_summary": personal_summary,
            "industry_faqs": industry_faqs,
            "questions_data": questions_data,
            "answers_data": answers_data,
        }

        # Persist everything to Firestore.
        await _save_workflow_results_to_database(user_id, session_id, session_state_updates)

        warnings = []
        if not questions_data:
            warnings.append("No interview questions were generated — check the resume/job description.")
        if not answers_data:
            warnings.append("No model answers were generated.")

        return {
            "success": True,
            "user_id": user_id,
            "session_id": session_id,
            "workflow_id": workflow_id,
            "completed_agents": completed_agents,
            "warnings": warnings,
            "personal_summary": json.dumps(personal_summary, ensure_ascii=False),
            "industry_faqs": json.dumps(industry_faqs, ensure_ascii=False),
            "questions_data": json.dumps(questions_data, ensure_ascii=False),
            "final_answers": json.dumps(answers_data, ensure_ascii=False),
        }

    except Exception as exc:
        print(f"Error in run_preparation_workflow: {exc}")
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(exc),
            "user_id": user_id,
            "session_id": session_id,
            "workflow_id": workflow_id,
        }


def _run_search_agent(job_description: str) -> dict:
    """Web-search real interview questions, then organize them with Groq."""
    job_title = job_description.split("\n")[0][:80] if job_description else "this role"
    results = _search_web(job_title, job_description)

    search_prompt = _format_prompt(
        SEARCH_PROMPT,
        **{
            "personal_summary.title": job_title,
            "personal_summary.jobDescription": job_description,
        },
    )
    try:
        organized = groq_provider.chat_json(
            search_prompt,
            "Here are the raw search results. Organize them into the required JSON structure.\n\n"
            + json.dumps(results[:60], ensure_ascii=False),
        )
        return organized if organized else {"searchQueries": [], "interviewProcess": {}}
    except Exception as exc:
        print(f"[WARN] Search organization failed: {exc}")
        return {"searchQueries": [r.get("query", "") for r in results], "interviewProcess": {}}


async def _save_workflow_results_to_database(user_id, session_id, session_state_updates):
    """Save workflow results to Firestore."""
    try:
        personal_summary = session_state_updates.get("personal_summary", {})
        if personal_summary and isinstance(personal_summary, dict) and "error" not in personal_summary:
            try:
                from backend.data.database import firestore_db
                from backend.data.schemas import PersonalExperience, Workflow

                title = personal_summary.get("title", "")
                if title:
                    firestore_db.create_or_update_workflow(user_id, session_id, Workflow(title=title))
                    print(f"Saved workflow title '{title}' for user {user_id}, workflow {session_id}")

                personal_experience = PersonalExperience(
                    resumeInfo=personal_summary.get("resumeInfo", ""),
                    linkedinInfo=personal_summary.get("linkedinInfo", ""),
                    githubInfo=personal_summary.get("githubInfo", ""),
                    portfolioInfo=personal_summary.get("portfolioInfo", ""),
                    additionalInfo=personal_summary.get("additionalInfo", ""),
                    jobDescription=personal_summary.get("jobDescription", ""),
                )
                firestore_db.set_personal_experience(user_id, session_id, personal_experience)
                print(f"Saved personal experience for user {user_id}, workflow {session_id}")
            except Exception as exc:
                print(f"[WARN] Could not save PersonalExperience: {exc}")

        final_answers = session_state_updates.get("answers_data", [])
        if final_answers and isinstance(final_answers, list) and len(final_answers) > 0:
            try:
                from backend.data.database import firestore_db
                from backend.data.schemas import RecommendedQA

                sample = final_answers[0] if isinstance(final_answers[0], dict) else {}
                if sample.get("answer"):
                    recommended_qas = []
                    for item in final_answers:
                        if isinstance(item, dict):
                            tags = item.get("tags", [])
                            if not isinstance(tags, list):
                                tags = [tags] if isinstance(tags, str) else []
                            recommended_qas.append(
                                RecommendedQA(
                                    question=item.get("question", ""),
                                    answer=item.get("answer", ""),
                                    tags=tags,
                                )
                            )
                    if recommended_qas:
                        firestore_db.set_recommended_qas(user_id, session_id, recommended_qas)
                        print(f"Saved {len(recommended_qas)} recommended QAs for user {user_id}, workflow {session_id}")
                else:
                    print("[WARN] Answers missing 'answer' field; skipping QA save.")
            except Exception as exc:
                print(f"[WARN] Could not save RecommendedQAs: {exc}")
        else:
            print("[WARN] No valid answers_data found for database storage.")
    except Exception as exc:
        print(f"Error in database save operations: {exc}")


def run_preparation_workflow_sync(*args, **kwargs):
    """Synchronous wrapper for the async workflow function."""
    return asyncio.run(run_preparation_workflow(*args, **kwargs))
