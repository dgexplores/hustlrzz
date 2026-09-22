"""Shared DuckDuckGo retrieval used by preparation and company intelligence.

Search is best-effort by design: every failure path returns an empty list and
callers fall back to built-in knowledge.
"""

from __future__ import annotations

from datetime import datetime, timezone
from urllib.parse import urlparse

from backend import config
from backend.obs import log


def clean_web_results(results: list[dict], limit: int = 24) -> list[dict]:
    """Keep only unique, attributable HTTP sources before they reach the model."""
    cleaned: list[dict] = []
    seen: set[str] = set()
    for item in results:
        url = str(item.get("url") or item.get("href") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or url in seen:
            continue
        title = str(item.get("title") or parsed.netloc).strip()[:240]
        snippet = str(item.get("snippet") or item.get("body") or "").strip()[:1200]
        if not snippet:
            continue
        seen.add(url)
        cleaned.append({
            "id": f"S{len(cleaned) + 1}",
            "title": title,
            "url": url,
            "domain": parsed.netloc.removeprefix("www."),
            "snippet": snippet,
            "published_at": str(item.get("date") or item.get("published_at") or "")[:80],
            "query": str(item.get("query") or "")[:240],
            "category": str(item.get("category") or "general")[:80],
        })
        if len(cleaned) >= limit:
            break
    return cleaned


def search_company_web(company_name: str, job_title: str = "", max_results: int = 5) -> list[dict]:
    """Retrieve an on-demand, multi-angle company interview evidence set."""
    year = datetime.now(timezone.utc).year
    role_clause = f' "{job_title}"' if job_title else ""
    queries = [
        ("role_demand", f'"{company_name}"{role_clause} careers jobs requirements skills'),
        ("hiring_process", f'"{company_name}" interview process hiring process careers'),
        ("question_patterns", f'"{company_name}"{role_clause} interview questions technical behavioral'),
        ("candidate_experience", f'"{company_name}"{role_clause} interview experience stages rounds'),
        ("values_culture", f'"{company_name}" official values leadership principles culture'),
        ("engineering_product", f'"{company_name}" engineering blog product strategy {year}'),
        ("business_priorities", f'"{company_name}" annual report investor priorities {year}'),
        ("aptitude_rounds", f'"{company_name}" placement aptitude test online assessment rounds pattern'),
    ]
    results: list[dict] = []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            for category, query in queries:
                try:
                    for item in ddgs.text(query, max_results=max_results):
                        results.append({**item, "query": query, "category": category})
                except Exception:
                    continue
            try:
                for item in ddgs.news(
                    f'"{company_name}" hiring strategy product engineering',
                    timelimit="m",
                    max_results=max_results,
                ):
                    results.append({**item, "query": "recent company news", "category": "recent_news"})
            except Exception:
                pass
    except Exception as exc:
        log.warning("company search failed: %s", exc)

    company_token = "".join(character for character in company_name.lower() if character.isalnum())

    def source_priority(item: dict) -> tuple[int, str]:
        url = str(item.get("url") or item.get("href") or "").lower()
        domain_token = "".join(character for character in urlparse(url).netloc.lower() if character.isalnum())
        query = str(item.get("query") or "").lower()
        category = str(item.get("category") or "")
        score = 0
        if company_token and company_token in domain_token:
            score += 8
        if any(term in url for term in ("career", "jobs", "investor", "annual-report", "about")):
            score += 3
        if "careers" in query or "annual report" in query:
            score += 2
        if category in {"role_demand", "hiring_process", "business_priorities", "aptitude_rounds", "question_patterns"}:
            score += 1
        if item.get("date"):
            score += 1
        return (-score, url)

    return clean_web_results(sorted(results, key=source_priority))


def search_industry_questions(job_title: str, max_results: int = 5) -> list[dict]:
    queries = [
        (f"{job_title} interview questions", "questions"),
        (f"{job_title} common interview questions and answers", "questions"),
        (f"{job_title} behavioral interview questions", "behavioral"),
        (f"{job_title} technical interview questions", "technical"),
    ]
    results: list[dict] = []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            for query, category in queries:
                try:
                    for item in ddgs.text(query, max_results=max_results):
                        results.append({
                            "title": item.get("title", ""),
                            "url": item.get("href", ""),
                            "snippet": item.get("body", ""),
                            "query": query,
                            "category": category,
                        })
                except Exception:
                    continue
    except Exception as exc:
        log.warning("industry question search failed: %s", exc)
    return results


def search_web(query: str, max_results: int = 6) -> list[dict]:
    """Single-query DuckDuckGo search for the agent web_search tool.

    Best-effort: every failure path returns an empty list so the LLM loop
    continues without grounding rather than failing the request.
    """
    query = str(query or "").strip()[:300]
    if not query or not search_enabled():
        return []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            items = list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        log.warning("web_search tool failed: %s", exc)
        return []
    return clean_web_results(
        [{**item, "query": query, "category": "live_search"} for item in items],
        limit=max_results,
    )


def search_enabled() -> bool:
    return config.ENABLE_WEB_SEARCH
