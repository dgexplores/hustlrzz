"""BYOK keyring: per-user provider keys, encrypted at rest.

Security model
--------------
* AES-256-GCM. The provider name and the owning user id are bound in as
  additional authenticated data, so a ciphertext cannot be replayed under a
  different provider or a different user.
* The master key comes from ``AI_KEYS_ENCRYPTION_KEY``. If it is absent the
  keyring is *disabled* — it never falls back to a default, and plaintext is
  never written. Callers get :class:`KeyringDisabled`.
* The plaintext key is only ever materialised for the duration of one provider
  call, via a context manager.
"""

from __future__ import annotations

import base64
import contextlib
import os
from dataclasses import dataclass
from typing import Iterator

try:  # pragma: no cover - exercised by the import guard test
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except Exception:  # pragma: no cover
    AESGCM = None  # type: ignore[assignment]

    class InvalidTag(Exception):  # type: ignore[no-redef]
        pass


NONCE_BYTES = 12
KEY_BYTES = 32

# Providers a user may bring their own key for.
ALLOWED_BYOK_PROVIDERS = frozenset({"groq", "gemini", "openai", "openrouter"})

# Providers that have no usable free tier. They are only ever reachable when
# the *user* supplies a key, or when an operator opts in explicitly.
PAID_PROVIDERS = frozenset({"openai"})


class KeyringDisabled(RuntimeError):
    """Raised when BYOK is used without AI_KEYS_ENCRYPTION_KEY configured."""


class KeyringDecryptError(RuntimeError):
    """Raised when a stored ciphertext cannot be authenticated."""


def _master_key() -> bytes:
    raw = (os.getenv("AI_KEYS_ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise KeyringDisabled(
            "Bring-your-own-key is not configured. Set AI_KEYS_ENCRYPTION_KEY to enable it."
        )
    if AESGCM is None:
        raise KeyringDisabled("The 'cryptography' package is required for bring-your-own-key.")
    try:
        # validate=True: base64.urlsafe_b64decode is lenient and silently drops
        # non-alphabet characters, so a malformed key would "decode" to a short
        # key instead of being rejected. Fail loudly instead.
        key = base64.b64decode(_pad_b64(raw), altchars=b"-_", validate=True)
    except Exception as exc:
        raise KeyringDisabled("AI_KEYS_ENCRYPTION_KEY is not valid base64.") from exc
    if len(key) != KEY_BYTES:
        raise KeyringDisabled(
            f"AI_KEYS_ENCRYPTION_KEY must decode to {KEY_BYTES} bytes, got {len(key)}."
        )
    return key


def _pad_b64(value: str) -> str:
    """Accept both padded and unpadded urlsafe base64."""
    return value + "=" * (-len(value) % 4)


def is_enabled() -> bool:
    try:
        _master_key()
        return True
    except KeyringDisabled:
        return False


def _aad(user_id: str, provider: str) -> bytes:
    return f"{user_id}:{provider}".encode()


def encrypt_key(*, user_id: str, provider: str, plaintext: str) -> str:
    if provider not in ALLOWED_BYOK_PROVIDERS:
        raise ValueError(f"Unsupported provider for bring-your-own-key: {provider}")
    if not plaintext.strip():
        raise ValueError("The key is empty.")
    aes = AESGCM(_master_key())
    nonce = os.urandom(NONCE_BYTES)
    blob = aes.encrypt(nonce, plaintext.encode(), _aad(user_id, provider))
    return base64.urlsafe_b64encode(nonce + blob).decode()


def decrypt_key(*, user_id: str, provider: str, ciphertext: str) -> str:
    aes = AESGCM(_master_key())
    try:
        raw = base64.urlsafe_b64decode(_pad_b64(ciphertext))
    except Exception as exc:
        raise KeyringDecryptError("Stored key is not valid base64.") from exc
    nonce, blob = raw[:NONCE_BYTES], raw[NONCE_BYTES:]
    try:
        return aes.decrypt(nonce, blob, _aad(user_id, provider)).decode()
    except InvalidTag as exc:
        raise KeyringDecryptError(
            "Stored key failed authentication; it was written under a different master key."
        ) from exc


def key_hint(plaintext: str) -> str:
    """Last 4 characters, for display only. Never enough to reconstruct a key."""
    tail = plaintext.strip()[-4:]
    return f"…{tail}" if tail else ""


def is_allowed_provider(provider: str) -> bool:
    return provider in ALLOWED_BYOK_PROVIDERS


def is_paid_provider(provider: str) -> bool:
    return provider in PAID_PROVIDERS


@dataclass(frozen=True)
class UserKeys:
    """Decrypted keys for one request, held no longer than the request."""

    keys: dict[str, str]

    @contextlib.contextmanager
    def use(self, provider: str) -> Iterator[str | None]:
        value = self.keys.get(provider)
        try:
            yield value
        finally:
            self.keys.pop(provider, None)

    def get(self, provider: str) -> str | None:
        return self.keys.get(provider)

    def __bool__(self) -> bool:
        return bool(self.keys)
