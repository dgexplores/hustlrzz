"""Unit tests for domestics (provider parse, company profiles, session, schemas)."""

import importlib
import sys
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
    assert not re.fullmatch(config.CORS_ORIGIN_REGEX, "https://malicious.example.com")


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
