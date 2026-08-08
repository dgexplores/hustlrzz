"""Tests for Groq backup-key rotation (GROQ_API_KEYS).

These tests mock the HTTP layer, so they never touch the real Groq API.
"""

from unittest import mock

import httpx
import pytest

from backend.tools import groq_provider
from backend.tools.groq_provider import GroqRateLimitError


class _FakeResponse:
    """Minimal stand-in for httpx.Response used by _post_json."""

    def __init__(self, status_code: int, text: str = ""):
        self.status_code = status_code
        self.text = text

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"HTTP {self.status_code}", request=httpx.Request("POST", "http://x"), response=self
            )

    def json(self):
        return {"choices": [{"message": {"content": '{"ok": true}'}}]}


@pytest.fixture
def fake_keys(monkeypatch):
    """Three fake keys, primary first."""
    monkeypatch.setattr(groq_provider.GroqConfig, "API_KEY", "primary-key")
    monkeypatch.setattr(
        groq_provider.GroqConfig,
        "API_KEYS",
        ["primary-key", "backup-1", "backup-2"],
    )


def _make_client_mock(responses):
    """A client factory that pops responses off the list in order."""
    responses = list(responses)

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            if not responses:
                return _FakeResponse(200)
            return responses.pop(0)

    return _FakeClient


def test_active_keys_primary_first(fake_keys):
    keys = groq_provider._active_keys()
    assert keys == ["primary-key", "backup-1", "backup-2"]


def test_active_keys_deduplicates(monkeypatch):
    monkeypatch.setattr(groq_provider.GroqConfig, "API_KEY", "a")
    monkeypatch.setattr(groq_provider.GroqConfig, "API_KEYS", ["a", "a", "b"])
    assert groq_provider._active_keys() == ["a", "b"]


def test_rotates_to_backup_key_on_rate_limit(fake_keys):
    """Primary 429s forever, backup-1 succeeds -> request must carry backup-1's token."""
    seen_auth = []

    class _RecordingClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            seen_auth.append(headers["Authorization"])
            if headers["Authorization"] == "Bearer primary-key":
                return _FakeResponse(429, "rate limited")
            return _FakeResponse(200)

    with mock.patch.object(groq_provider.httpx, "Client", _RecordingClient), \
         mock.patch.object(groq_provider, "time", mock.Mock()):
        result = groq_provider._post_json("/chat/completions", {"model": "x"}, timeout=5)

    assert result["choices"][0]["message"]["content"] == '{"ok": true}'
    assert "Bearer primary-key" in seen_auth
    assert "Bearer backup-1" in seen_auth
    # Rotation happened: at least one request went out on the backup key.
    assert seen_auth[-1] == "Bearer backup-1"


def test_all_keys_rate_limited_raises(fake_keys):
    """Every key 429s -> the call still fails, but only after trying all keys."""
    with mock.patch.object(groq_provider.httpx, "Client", _make_client_mock([_FakeResponse(429)] * 9)), \
         mock.patch.object(groq_provider, "time", mock.Mock()):
        with pytest.raises(groq_provider.GroqError) as exc_info:
            groq_provider._post_json("/chat/completions", {"model": "x"}, timeout=5)

    assert "3 key(s) x 3 attempts" in str(exc_info.value)
    assert isinstance(exc_info.value.__cause__, GroqRateLimitError)
