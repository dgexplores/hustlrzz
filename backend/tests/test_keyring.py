import base64
import os

import pytest

from backend.ai import keyring

KEY = base64.urlsafe_b64encode(os.urandom(32)).decode()


@pytest.fixture(autouse=True)
def master_key(monkeypatch):
    monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", KEY)
    yield


class TestMasterKey:
    def test_disabled_without_a_master_key(self, monkeypatch):
        monkeypatch.delenv("AI_KEYS_ENCRYPTION_KEY", raising=False)
        assert keyring.is_enabled() is False
        with pytest.raises(keyring.KeyringDisabled):
            keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_test")

    def test_never_falls_back_to_a_default_when_the_key_is_blank(self, monkeypatch):
        monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", "   ")
        with pytest.raises(keyring.KeyringDisabled):
            keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_test")

    def test_rejects_a_wrong_length_key(self, monkeypatch):
        monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"short").decode())
        assert keyring.is_enabled() is False
        with pytest.raises(keyring.KeyringDisabled, match="32 bytes"):
            keyring.encrypt_key(user_id="u1", provider="groq", plaintext="k")

    def test_accepts_unpadded_base64(self, monkeypatch):
        monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", KEY.rstrip("="))
        assert keyring.is_enabled() is True

    def test_rejects_non_base64(self, monkeypatch):
        # urlsafe_b64decode is lenient and would silently drop the junk, so the
        # master key must be validated strictly.
        monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", "not base64 !!!")
        assert keyring.is_enabled() is False
        with pytest.raises(keyring.KeyringDisabled, match="base64"):
            keyring.encrypt_key(user_id="u1", provider="groq", plaintext="k")


class TestRoundTrip:
    def test_encrypts_and_decrypts(self):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live_abc123")
        assert keyring.decrypt_key(user_id="u1", provider="groq", ciphertext=blob) == "gsk_live_abc123"

    def test_ciphertext_is_not_the_plaintext(self):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live_abc123")
        assert "gsk_live_abc123" not in blob

    def test_nonce_is_fresh_per_write(self):
        a = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="same-key")
        b = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="same-key")
        assert a != b

    def test_rejects_an_unsupported_provider(self):
        with pytest.raises(ValueError, match="Unsupported provider"):
            keyring.encrypt_key(user_id="u1", provider="evilcorp", plaintext="k")

    def test_rejects_an_empty_key(self):
        with pytest.raises(ValueError, match="empty"):
            keyring.encrypt_key(user_id="u1", provider="groq", plaintext="   ")


class TestBinding:
    def test_ciphertext_cannot_be_replayed_under_another_user(self):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live")
        with pytest.raises(keyring.KeyringDecryptError):
            keyring.decrypt_key(user_id="u2", provider="groq", ciphertext=blob)

    def test_ciphertext_cannot_be_replayed_under_another_provider(self):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live")
        with pytest.raises(keyring.KeyringDecryptError):
            keyring.decrypt_key(user_id="u1", provider="openai", ciphertext=blob)

    def test_tampered_ciphertext_is_rejected(self):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live")
        raw = bytearray(base64.urlsafe_b64decode(blob))
        raw[-1] ^= 0xFF
        with pytest.raises(keyring.KeyringDecryptError):
            keyring.decrypt_key(
                user_id="u1", provider="groq", ciphertext=base64.urlsafe_b64encode(bytes(raw)).decode()
            )

    def test_key_written_under_a_different_master_key_fails_closed(self, monkeypatch):
        blob = keyring.encrypt_key(user_id="u1", provider="groq", plaintext="gsk_live")
        monkeypatch.setenv("AI_KEYS_ENCRYPTION_KEY", base64.urlsafe_b64encode(os.urandom(32)).decode())
        with pytest.raises(keyring.KeyringDecryptError):
            keyring.decrypt_key(user_id="u1", provider="groq", ciphertext=blob)


class TestKeyHint:
    def test_exposes_only_the_last_four(self):
        assert keyring.key_hint("gsk_live_abcdefgh") == "…efgh"

    def test_is_empty_for_an_empty_key(self):
        assert keyring.key_hint("   ") == ""


class TestUserKeys:
    def test_reports_whether_any_key_is_present(self):
        assert bool(keyring.UserKeys(keys={})) is False
        assert bool(keyring.UserKeys(keys={"groq": "k"})) is True

    def test_use_yields_then_forgets(self):
        keys = keyring.UserKeys(keys={"groq": "k"})
        with keys.use("groq") as value:
            assert value == "k"
        assert keys.keys == {}

    def test_get_does_not_consume(self):
        keys = keyring.UserKeys(keys={"groq": "k"})
        assert keys.get("groq") == "k"
        assert keys.get("groq") == "k"
