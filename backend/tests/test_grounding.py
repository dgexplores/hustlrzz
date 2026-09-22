"""Grounded chat: autonomous web_search tool loop + fail-soft fallbacks."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.ai import grounding  # noqa: E402


def test_search_disabled_skips_tools(monkeypatch):
    from backend import config

    monkeypatch.setattr(config, "ENABLE_WEB_SEARCH", False)
    called = {}
    monkeypatch.setattr(
        grounding.provider,
        "chat",
        lambda system, user, temperature=0.4: called.update({"plain": True}) or "ok",
    )
    monkeypatch.setattr(
        grounding.provider,
        "chat_messages",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not tool-loop")),
    )
    text, sources = grounding.grounded_chat("sys", "user")
    assert text == "ok"
    assert sources == []
    assert called.get("plain")


def test_tool_loop_runs_search_and_returns_sources(monkeypatch):
    rounds = {"n": 0}
    captured = {}

    def fake_chat_messages(messages, temperature=0.4, tools=None):
        rounds["n"] += 1
        captured["tools"] = tools
        if rounds["n"] == 1:
            return {
                "content": "",
                "tool_calls": [{
                    "id": "call_1",
                    "name": "web_search",
                    "arguments": '{"query": "senior engineer salary 2026"}',
                }],
            }
        return {"content": "Market is $150k [S1].", "tool_calls": []}

    monkeypatch.setattr(grounding.provider, "chat_messages", fake_chat_messages)
    monkeypatch.setattr(
        grounding.web_research,
        "search_web",
        lambda query, max_results=6: [{
            "id": "S1",
            "title": "Salary survey",
            "url": "https://example.com/salary",
            "domain": "example.com",
            "snippet": "Senior engineers earn around 150k.",
            "published_at": "",
            "query": query,
            "category": "live_search",
        }],
    )

    text, sources = grounding.grounded_chat("sys", "user")
    assert "web_search" in str(captured["tools"])
    assert "[S1]" in text
    assert sources[0]["url"] == "https://example.com/salary"
    assert sources[0]["id"] == "S1"


def test_tool_loop_fails_soft_to_plain_chat(monkeypatch):
    monkeypatch.setattr(
        grounding.provider,
        "chat_messages",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("providers down")),
    )
    monkeypatch.setattr(
        grounding.provider,
        "chat",
        lambda system, user, temperature=0.4: "fallback answer",
    )
    text, sources = grounding.grounded_chat("sys", "user")
    assert text == "fallback answer"
    assert sources == []


def test_unknown_tool_does_not_crash_loop(monkeypatch):
    rounds = {"n": 0}

    def fake_chat_messages(messages, temperature=0.4, tools=None):
        rounds["n"] += 1
        if rounds["n"] == 1:
            return {
                "content": "",
                "tool_calls": [{"id": "c1", "name": "rm_rf", "arguments": "{}"}],
            }
        return {"content": "done without search", "tool_calls": []}

    monkeypatch.setattr(grounding.provider, "chat_messages", fake_chat_messages)
    text, sources = grounding.grounded_chat("sys", "user")
    assert text == "done without search"
    assert sources == []


def test_search_web_respects_disable(monkeypatch):
    from backend import config
    from backend.career import web_research

    monkeypatch.setattr(config, "ENABLE_WEB_SEARCH", False)
    assert web_research.search_web("anything") == []


def test_search_budget_exhausted_still_returns_final_answer(monkeypatch):
    rounds = {"n": 0}

    def fake_chat_messages(messages, temperature=0.4, tools=None):
        rounds["n"] += 1
        if rounds["n"] <= grounding.MAX_ROUNDS:
            return {
                "content": "",
                "tool_calls": [{
                    "id": f"call_{rounds['n']}",
                    "name": "web_search",
                    "arguments": '{"query": "q"}',
                }],
            }
        return {"content": "final", "tool_calls": []}

    monkeypatch.setattr(grounding.provider, "chat_messages", fake_chat_messages)
    monkeypatch.setattr(grounding.web_research, "search_web", lambda *a, **k: [
        {"id": "S1", "title": "t", "url": "https://a.com/x", "domain": "a.com", "snippet": "s",
         "published_at": "", "query": "q", "category": "live_search"},
    ])
    text, sources = grounding.grounded_chat("sys", "user")
    assert text == "final"
    assert len(sources) <= grounding.MAX_SOURCES
