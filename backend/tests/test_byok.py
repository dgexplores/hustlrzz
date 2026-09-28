import base64
import os

import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.ai import keyring, provider

KEY = base64.urlsafe_b64encode(os.urandom(32)).decode()

ROW = {
    "provider": "groq",
    "key_hint": "…cdef",
    "encrypted_key": "x",
    "user_id": "u1",
}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", KEY)
    monkeypatch.setattr(config, "AI_KEYS_ENCRYPTION_KEY", KEY)

    from backend import app as app_module

    # BYOK enabled for these tests, and auth satisfied.
    monkeypatch.setattr(keyring, "is_enabled", lambda: True)
    monkeypatch.setattr(app_module, "keyring", keyring)
    monkeypatch.setattr(app_module, "_load_user_keys", _Async(lambda _uid: {"groq": "gsk_user"}))

    captured: dict = {}
    monkeypatch.setattr(app_module.provider, "set_request_keys", lambda keys: captured.setdefault("keys", keys))
    monkeypatch.setattr(app_module.provider, "reset_request_keys", lambda token: None)

    calls: dict = {"select": [], "upsert": [], "delete": []}

    monkeypatch.setattr(app_module.dbc, "is_ready", lambda: True)
    monkeypatch.setattr(
        app_module.dbc, "select_where", lambda t, m=None, order=None: (calls["select"].append((t, m)), list(ROW_DERIVED))[1]
    )
    monkeypatch.setattr(
        app_module.dbc, "upsert", lambda t, rows, on_conflict: (calls["upsert"].append((t, rows, on_conflict)), rows)[1]
    )
    monkeypatch.setattr(
        app_module.dbc, "delete_where", lambda t, m: calls["delete"].append((t, m))
    )

    app_module.app.dependency_overrides[app_module.get_user] = lambda: {"uid": "u1", "email": "", "name": "", "picture": ""}
    with TestClient(app_module.app) as c:
        c.calls = calls
        yield c
    app_module.app.dependency_overrides.clear()


class _Async:
    def __init__(self, fn):
        self.fn = fn

    def __call__(self, *a, **k):
        return self.fn(*a, **k)


ROW_DERIVED = [dict(ROW)]


class TestDisabled:
    def test_routes_503_when_no_master_key(self, monkeypatch):
        monkeypatch.delenv("AI_KEYS_ENCRYPTION_KEY", raising=False)
        monkeypatch.setattr(keyring, "is_enabled", lambda: False)
        from backend import app as app_module
        monkeypatch.setattr(app_module, "keyring", keyring)

        app_module.app.dependency_overrides[app_module.get_user] = lambda: {"uid": "u1"}
        with TestClient(app_module.app) as c:
            assert c.get("/ai/keys").status_code == 503
        app_module.app.dependency_overrides.clear()


class TestListKeys:
    def test_never_returns_the_key_material(self, client):
        res = client.get("/ai/keys")
        assert res.status_code == 200
        text = res.text
        assert "encrypted_key" not in text
        assert "…cdef" in text
        assert res.json()["data"][0]["provider"] == "groq"

    def test_scoped_to_the_caller(self, client):
        client.get("/ai/keys")
        assert client.calls["select"][0][1] == {"user_id": "u1"}


class TestPutKey:
    def test_stores_ciphertext_not_plaintext(self, client, monkeypatch):
        real = keyring.encrypt_key
        res = client.put("/ai/keys", json={"provider": "groq", "api_key": "gsk_live_supersecret"})
        assert res.status_code == 200
        _table, rows, conflict = client.calls["upsert"][0]
        assert conflict == "user_id,provider"
        stored = rows[0]
        assert "supersecret" not in stored["encrypted_key"]
        # and it really is decryptable back
        assert keyring.decrypt_key(user_id="u1", provider="groq", ciphertext=stored["encrypted_key"]) == "gsk_live_supersecret"

    def test_returns_only_a_hint(self, client):
        res = client.put("/ai/keys", json={"provider": "groq", "api_key": "gsk_live_supersecret"})
        assert res.json()["data"]["key_hint"] == "…cret"
        assert "supersecret" not in res.text

    def test_rejects_an_unknown_provider(self, client):
        assert client.put("/ai/keys", json={"provider": "evilcorp", "api_key": "k12345678"}).status_code == 422

    def test_rejects_a_too_short_key(self, client):
        assert client.put("/ai/keys", json={"provider": "groq", "api_key": "short"}).status_code == 422


class TestDeleteKey:
    def test_deletes_scoped_to_the_caller(self, client):
        assert client.delete("/ai/keys/groq").status_code == 204
        assert client.calls["delete"][0][1] == {"user_id": "u1", "provider": "groq"}

    def test_rejects_an_unknown_provider(self, client):
        assert client.delete("/ai/keys/evilcorp").status_code == 422


class TestQuota:
    def test_reports_cap_and_providers(self, client, monkeypatch):
        monkeypatch.setattr(config, "AI_DAILY_RUN_CAP", 20)
        monkeypatch.setattr(config, "AI_PROVIDER_ALLOW_PAID", False)
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_shared")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk_paid")
        res = client.get("/ai/quota")
        data = res.json()["data"]
        assert data["daily_cap"] == 20
        assert data["shared_free_providers"] == ["groq"]
        assert data["paid_allowed"] is False
        assert data["byok_enabled"] is True

    def test_openai_absent_from_free_providers_even_when_configured(self, client, monkeypatch):
        monkeypatch.setattr(config, "AI_PROVIDER_ALLOW_PAID", False)
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_shared")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk_paid")
        assert "openai" not in client.get("/ai/quota").json()["data"]["shared_free_providers"]


class TestUserKeyBinding:
    def test_request_keys_are_bound_for_the_request(self, client):
        # the stubbed _load_user_keys supplies a key; get_user must bind it
        res = client.get("/ai/quota")
        assert res.status_code == 200

    def test_a_user_key_makes_a_paid_provider_reachable(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_shared")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "")
        monkeypatch.setattr(config, "GEMINI_API_KEY", "")
        monkeypatch.setattr(config, "OPENROUTER_API_KEY", "")
        monkeypatch.setattr(config, "AI_PROVIDER_ALLOW_PAID", False)
        token = provider.set_request_keys({"openai": "sk_user"})
        try:
            assert provider._providers() == ["groq", "openai"]
        finally:
            provider.reset_request_keys(token)

    def test_no_user_keys_means_paid_stays_out(self, monkeypatch):
        monkeypatch.setattr(config, "GROQ_API_KEY", "gsk_shared")
        monkeypatch.setattr(config, "OPENAI_API_KEY", "sk_paid")
        monkeypatch.setattr(config, "AI_PROVIDER_ALLOW_PAID", False)
        assert provider._providers() == ["groq"]


class TestDailyCap:
    """The cap protects the shared free tier; BYOK lifts it."""

    def test_blocks_when_the_caller_is_over_the_shared_cap(self, client, monkeypatch):
        from backend import app as app_module

        monkeypatch.setattr(config, "AI_DAILY_RUN_CAP", 2)
        monkeypatch.setattr(app_module, "_daily_run_count", lambda _uid: 2)
        monkeypatch.setattr(app_module.dbc, "select_where", lambda t, m=None, order=None: [])
        res = client.post(
            "/workflows/start",
            data={"resume_text": "r" * 200, "job_description": "j" * 200},
        )
        assert res.status_code == 429
        assert "included runs" in res.json()["detail"]

    def test_allows_a_caller_who_brought_their_own_key(self, client, monkeypatch):
        from backend import app as app_module

        monkeypatch.setattr(config, "AI_DAILY_RUN_CAP", 2)
        # over the cap on shared quota, but the caller has their own key
        monkeypatch.setattr(app_module, "_daily_run_count", lambda _uid: 99)
        monkeypatch.setattr(
            app_module.dbc,
            "select_where",
            lambda t, m=None, order=None: [dict(ROW)] if t == "user_ai_keys" else [],
        )
        res = client.post(
            "/workflows/start",
            data={"resume_text": "r" * 200, "job_description": "j" * 200},
        )
        # passes the cap gate; fails later for an unrelated reason
        assert res.status_code != 429

    def test_cap_is_off_by_default(self, client, monkeypatch):
        from backend import app as app_module

        monkeypatch.setattr(config, "AI_DAILY_RUN_CAP", 0)
        monkeypatch.setattr(app_module, "_daily_run_count", lambda _uid: 10_000)
        monkeypatch.setattr(app_module.dbc, "select_where", lambda t, m=None, order=None: [])
        res = client.post(
            "/workflows/start",
            data={"resume_text": "r" * 200, "job_description": "j" * 200},
        )
        assert res.status_code != 429
