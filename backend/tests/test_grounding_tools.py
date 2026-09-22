"""Tests for grounding: tool loop, citation scrub, fetch_page SSRF safety."""

from __future__ import annotations

import socket

import httpx
import pytest

from backend import config
from backend.ai import grounding, provider
from backend.career import web_research


# --------------------------------------------------------------------------- #
# Citation scrub
# --------------------------------------------------------------------------- #
class TestScrubCitations:
    def test_keeps_valid_ids(self):
        sources = [{"id": "S1"}, {"id": "S2"}]
        text = "Salary is $100k [S1] but market says $90k [S2]."
        assert grounding.scrub_citations(text, sources) == text

    def test_strips_invalid_ids(self):
        sources = [{"id": "S1"}]
        text = "Claim [S1] and ghost [S7]."
        assert grounding.scrub_citations(text, sources) == "Claim [S1] and ghost ."

    def test_strips_all_when_no_sources(self):
        text = "Claim [S1] and [S2]."
        assert grounding.scrub_citations(text, sources=[]) == "Claim and ."

    def test_empty_text(self):
        assert grounding.scrub_citations("", [{"id": "S1"}]) == ""

    def test_collapses_double_spaces(self):
        sources = [{"id": "S1"}]
        text = "keep [S1] drop [S9] done"
        assert grounding.scrub_citations(text, sources) == "keep [S1] drop done"


# --------------------------------------------------------------------------- #
# fetch_page SSRF / policy
# --------------------------------------------------------------------------- #
class TestAssertSafeUrl:
    def test_blocks_non_http_schemes(self):
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("ftp://example.com/x")
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("file:///etc/passwd")
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("")

    def test_blocks_localhost_hostname(self):
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("http://localhost/admin")

    def test_blocks_private_ip_resolution(self, monkeypatch):
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 80))],
        )
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("http://internal.example/")

    def test_blocks_link_local(self, monkeypatch):
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda *a, **k: [(2, 1, 6, "", ("169.254.169.254", 80))],
        )
        with pytest.raises(web_research.FetchBlocked):
            web_research._assert_safe_url("http://metadata.example/")

    def test_allows_public_ip(self, monkeypatch):
        monkeypatch.setattr(
            socket,
            "getaddrinfo",
            lambda *a, **k: [(2, 1, 6, "", ("93.184.216.34", 80))],
        )
        assert web_research._assert_safe_url("https://example.com/") == "https://example.com/"


class TestFetchPageText:
    def test_empty_url_returns_error(self):
        result = web_research.fetch_page_text("")
        assert "error" in result

    def test_blocked_url_returns_error_not_raise(self):
        # localhost blocked before any network call
        result = web_research.fetch_page_text("http://localhost:8080/")
        assert "error" in result
        assert "blocked" in result["error"] or "local" in result["error"]

    def test_happy_path_strips_html(self, monkeypatch):
        html = b"<html><head><title>Page Title</title><style>.x{}</style></head><body><script>evil()</script><h1>Hello</h1><p>World</p></body></html>"

        class FakeResponse:
            status_code = 200
            headers = {"content-type": "text/html; charset=utf-8"}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def iter_bytes(self):
                yield html

        class FakeClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def stream(self, method, url):
                return FakeResponse()

        monkeypatch.setattr(web_research.httpx, "Client", FakeClient)
        monkeypatch.setattr(
            web_research,
            "_assert_safe_url",
            lambda u: u,
        )
        result = web_research.fetch_page_text("https://example.com/article")
        assert result["title"] == "Page Title"
        assert "Hello" in result["text"]
        assert "World" in result["text"]
        assert "evil" not in result["text"]
        assert "x{}" not in result["text"]

    def test_unsupported_content_type(self, monkeypatch):
        class FakeResponse:
            status_code = 200
            headers = {"content-type": "application/pdf"}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def iter_bytes(self):
                yield b"%PDF"

        class FakeClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def stream(self, method, url):
                return FakeResponse()

        monkeypatch.setattr(web_research.httpx, "Client", FakeClient)
        monkeypatch.setattr(web_research, "_assert_safe_url", lambda u: u)
        result = web_research.fetch_page_text("https://example.com/file.pdf")
        assert "error" in result
        assert "content-type" in result["error"]

    def test_http_error_status(self, monkeypatch):
        class FakeResponse:
            status_code = 404
            headers = {"content-type": "text/html"}

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def iter_bytes(self):
                yield b""

        class FakeClient:
            def __init__(self, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

            def stream(self, method, url):
                return FakeResponse()

        monkeypatch.setattr(web_research.httpx, "Client", FakeClient)
        monkeypatch.setattr(web_research, "_assert_safe_url", lambda u: u)
        result = web_research.fetch_page_text("https://example.com/missing")
        assert "error" in result
        assert "404" in result["error"]


# --------------------------------------------------------------------------- #
# Tool loop wiring
# --------------------------------------------------------------------------- #
class TestToolLoop:
    def test_fetch_tool_registered(self):
        names = {t["function"]["name"] for t in [grounding.WEB_SEARCH_TOOL, grounding.FETCH_PAGE_TOOL]}
        assert names == {"web_search", "fetch_page"}

    def test_budget_constants(self):
        assert grounding.MAX_SEARCHES >= 1
        assert grounding.MAX_FETCHES >= 1

    def test_tool_loop_calls_fetch_page(self, monkeypatch):
        calls: list[str] = []

        def fake_chat_messages(messages, temperature, tools=None):
            last = messages[-1]
            if last["role"] == "user":
                calls.append("start")
                return {
                    "content": "",
                    "tool_calls": [
                        {"id": "c1", "name": "fetch_page", "arguments": '{"url": "https://example.com/a"}'}
                    ],
                }
            if last["role"] == "tool":
                calls.append(f"tool:{last.get('name')}")
                return {"content": "Done with [S1].", "tool_calls": []}
            return {"content": "final", "tool_calls": []}

        def fake_fetch(url):
            return {"url": url, "title": "T", "text": "Body text"}

        monkeypatch.setattr(provider, "chat_messages", fake_chat_messages)
        monkeypatch.setattr(web_research, "fetch_page_text", fake_fetch)

        text, sources = grounding._tool_loop("sys", "user", 0.2)
        assert "tool:fetch_page" in calls
        # fetch alone produces no search sources → [S1] scrubbed
        assert sources == []
        assert text == "Done with ."

    def test_tool_loop_search_then_scrub(self, monkeypatch):
        state = {"round": 0}

        def fake_chat_messages(messages, temperature, tools=None):
            state["round"] += 1
            if state["round"] == 1:
                return {
                    "content": "",
                    "tool_calls": [
                        {"id": "c1", "name": "web_search", "arguments": '{"query": "backend salary"}'}
                    ],
                }
            return {"content": "Pay is $100k [S1] but we made up [S9].", "tool_calls": []}

        def fake_search(query, max_results=6):
            return [
                {"title": "T", "url": "https://a.com", "domain": "a.com", "snippet": "s", "published_at": ""}
            ]

        monkeypatch.setattr(provider, "chat_messages", fake_chat_messages)
        monkeypatch.setattr(web_research, "search_web", fake_search)

        text, sources = grounding._tool_loop("sys", "user", 0.2)
        assert len(sources) == 1
        assert sources[0]["id"] == "S1"
        assert "[S1]" in text
        assert "[S9]" not in text


# --------------------------------------------------------------------------- #
# Provider chain includes openai/openrouter when keys set
# --------------------------------------------------------------------------- #
class TestProviderChain:
    def test_groq_only_when_only_groq_key(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_x")
        monkeypatch.setattr(config, "GEMINI_API_KEY", "")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "")
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
        monkeypatch.setattr(config, "AI_PROVIDER", "groq")
        assert provider._providers() == ["groq"]

    def test_openai_joins_chain(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_x")
        monkeypatch.setattr(config, "GEMINI_API_KEY", "")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk-test")
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
        monkeypatch.setattr(config, "AI_PROVIDER", "groq")
        assert provider._providers() == ["groq", "openai"]

    def test_openrouter_preferred_first(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_x")
        monkeypatch.setattr(config, "GEMINI_API_KEY", "gm")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk")
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "or-key")
        monkeypatch.setattr(config, "AI_PROVIDER", "openrouter")
        chain = provider._providers()
        assert chain[0] == "openrouter"
        assert set(chain) == {"openrouter", "groq", "openai", "gemini"}

    def test_no_keys_raises(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "")
        monkeypatch.setattr(config, "GEMINI_API_KEY", "")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "")
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
        with pytest.raises(provider.ProviderError):
            provider.chat("s", "u")
