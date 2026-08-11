"""Unit tests for domestics (provider parse, company profiles, session, schemas)."""

import importlib
import sys
import zipfile
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.ai import provider  # noqa: E402
from backend.career import company_profiles  # noqa: E402


def test_extract_json_fence():
    data = provider.extract_json('```json\n{"a": 1}\n```')
    assert data == {"a": 1}


def test_extract_json_plain():
    data = provider.extract_json('{"b": 2}')
    assert data == {"b": 2}


def test_extract_json_prose_strip():
    data = provider.extract_json('Here you go:\n{"c": 3}\nGood luck!')
    assert data == {"c": 3}


def test_extract_json_invalid():
    data = provider.extract_json("not json at all")
    assert "error" in data or data == {}


def test_company_profile_google():
    p = company_profiles.company_profile("Google")
    assert p["style"]
    assert "Coding" in p["focus"]


def test_company_profile_generic_fallback():
    p = company_profiles.company_profile("SomeRandomStartup Inc")
    assert p["focus"]  # generic fallback present


def test_requirements_parseable():
    assert Path("requirements.txt").exists() or Path("backend/requirements.txt").exists()


def test_preview_cors_pattern_matches_frontend_preview_only():
    import re
    from backend import config
    assert re.fullmatch(config.CORS_ORIGIN_REGEX, "https://frontend-b6fqy2gmn-deepaklearn7878-6255s-projects.vercel.app")
    assert re.fullmatch(config.CORS_ORIGIN_REGEX, "https://frontend-deepaklearn7878-6255s-projects.vercel.app")
    assert not re.fullmatch(config.CORS_ORIGIN_REGEX, "https://malicious.example.com")


def test_industry_faqs_skips_external_search_when_disabled(monkeypatch):
    from backend.workflow import preparation
    monkeypatch.setattr(preparation.config, "ENABLE_WEB_SEARCH", False)
    monkeypatch.setattr(preparation, "_search_web", lambda *_: (_ for _ in ()).throw(AssertionError("should not search")))
    assert preparation._industry_faqs("Engineer", "Build reliable APIs") == {"real_questions": [], "interview_process": {}}


def test_company_sources_are_unique_and_attributable():
    from backend.workflow import preparation
    sources = preparation._clean_web_results([
        {"title": "Careers", "href": "https://example.com/careers", "body": "Hiring engineers."},
        {"title": "Duplicate", "href": "https://example.com/careers", "body": "Duplicate."},
        {"title": "Unsafe", "href": "javascript:alert(1)", "body": "Unsafe."},
    ])
    assert len(sources) == 1
    assert sources[0]["id"] == "S1"
    assert sources[0]["domain"] == "example.com"
    assert sources[0]["category"] == "general"


def test_company_research_discards_unknown_citations(monkeypatch):
    from backend.workflow import preparation
    monkeypatch.setattr(preparation.provider, "chat_json_strict", lambda *_: {
        "summary": "Evidence-based brief",
        "role_demands": [
            {"demand": "Reliable systems", "source_ids": ["S1"]},
            {"demand": "Unsupported demand", "source_ids": ["S99"]},
        ],
        "interview_structure": [{"stage": "Technical", "source_ids": ["S1"]}],
        "question_patterns": [{"example": "Design an API", "source_ids": ["S1", "S99"]}],
        "evaluation_criteria": [{"criterion": "Clarity", "source_ids": ["S99"]}],
        "recent_signals": [
            {"signal": "Supported", "source_ids": ["S1"]},
            {"signal": "Unsupported", "source_ids": ["S99"]},
        ],
        "preparation_actions": [],
    })
    result = preparation._organize_company_research("Example", "Engineer", [{
        "id": "S1", "title": "Careers", "url": "https://example.com/careers",
        "domain": "example.com", "snippet": "Hiring engineers.", "published_at": "",
    }])
    assert [signal["signal"] for signal in result["recent_signals"]] == ["Supported"]
    assert [item["demand"] for item in result["role_demands"]] == ["Reliable systems"]
    assert result["hiring_priorities"] == ["Reliable systems"]
    assert result["question_patterns"][0]["source_ids"] == ["S1"]
    assert result["evaluation_criteria"] == []


def test_chat_falls_back_when_preferred_fails(monkeypatch):
    """Preferred provider raises (rate-limit); other provider answers succeed."""
    import backend.config as config
    monkeypatch.setattr(config, "AI_PROVIDER", "groq")
    monkeypatch.setattr(config, "GROQ_API_KEY", "g")
    monkeypatch.setattr(config, "GEMINI_API_KEY", "gm")

    def boom(system, user, temperature=0.4):
        raise RuntimeError("rate limit")

    monkeypatch.setattr(provider, "_groq_chat", boom)
    monkeypatch.setattr(provider, "_gemini_chat", lambda s, u, temperature=0.4: "gem ok")
    assert provider.chat("s", "u") == "gem ok"


def test_chat_raises_when_all_fail(monkeypatch):
    """All configured providers failing surfaces a ProviderError."""
    import backend.config as config
    monkeypatch.setattr(config, "AI_PROVIDER", "groq")
    monkeypatch.setattr(config, "GROQ_API_KEY", "g")
    monkeypatch.setattr(config, "GEMINI_API_KEY", "gm")
    monkeypatch.setattr(provider, "_groq_chat",
                        lambda s, u, temperature=0.4: (_ for _ in ()).throw(RuntimeError("x")))
    monkeypatch.setattr(provider, "_gemini_chat",
                        lambda s, u, temperature=0.4: (_ for _ in ()).throw(RuntimeError("x")))
    import pytest
    with pytest.raises(provider.ProviderError):
        provider.chat("s", "u")


def test_interviewer_turn_adds_retrieval_context(monkeypatch):
    from backend.agents import interviewer
    seen = {}
    monkeypatch.setattr(interviewer.provider, "chat", lambda system, user: seen.update({"system": system}) or '{"message":"Next question"}')
    reply = interviewer.interviewer_turn(
        "base system", [], "My answer", retrieval_context="[Source: Resume]\nBuilt FastAPI services"
    )
    assert reply["message"] == "Next question"
    assert "CANDIDATE-OWNED REFERENCE CONTEXT" in seen["system"]
    assert "Built FastAPI services" in seen["system"]


def test_judge_question_context_uses_prepared_questions(monkeypatch):
    from backend.agents import interviewer
    seen = {}
    monkeypatch.setattr(
        interviewer.provider,
        "chat_json_strict",
        lambda system, user: seen.update({"user": user}) or {"summary": "ok"},
    )
    report = interviewer.judge_report(
        [{"question": "Describe a FastAPI service you built."}],
        [{"from": "candidate", "text": "I built an API."}],
        "",
        "",
    )
    assert report == {"summary": "ok"}
    assert "Describe a FastAPI service you built." in seen["user"]


def test_extract_docx_resume_text_without_extra_dependency():
    from backend.app import _extract_resume_text

    content = BytesIO()
    with zipfile.ZipFile(content, "w") as archive:
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            '<w:body><w:p><w:r><w:t>Built FastAPI services</w:t></w:r></w:p>'
            '<w:p><w:r><w:t>Improved latency</w:t></w:r></w:p></w:body></w:document>',
        )
    assert _extract_resume_text("resume.docx", content.getvalue()) == "Built FastAPI services\nImproved latency"


def test_fallback_interview_report_keeps_session_completable():
    from backend.app import _fallback_interview_report

    report = _fallback_interview_report()
    assert report["summary"]
    assert report["verdict"]
    assert report["improvements"]


def test_coaching_practice_passes_answer_and_presence_metrics(monkeypatch):
    from backend.career import analysis
    seen = {}
    monkeypatch.setattr(
        analysis.provider,
        "chat_json_strict",
        lambda system, user: seen.update({"system": system, "user": user}) or {
            "overall_score": 80, "summary": "Clear answer"
        },
    )
    result = analysis.evaluate_coaching_practice(
        "salary negotiation",
        "Why should we increase the offer?",
        "I would connect my delivery experience to the role and ask for a revised range.",
        {"notFacingCounter": 2},
    )
    assert result["overall_score"] == 80
    assert "Why should we increase the offer?" in seen["user"]
    assert "notFacingCounter" in seen["user"]
