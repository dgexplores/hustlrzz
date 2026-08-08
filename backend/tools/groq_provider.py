"""Groq AI provider — free, fast LLM inference for the whole app.

Groq's API is OpenAI-compatible, so we call it directly with httpx
(no extra dependency). It powers every AI feature:

  - preparation workflow  (summarizer, industry search, question & answer generation)
  - mock interview        (interviewer chat over WebSocket)
  - feedback judge        (structured JSON evaluation)
  - transcription (STT)   (optional, Whisper)
  - speech synthesis (TTS) (optional, Orpheus)

Free tier: ~1,000 requests/day on llama-3.3-70b, no credit card required.
"""

import json
import logging
import re
import time
from typing import Any, Optional

import httpx

from backend.config import GroqConfig

logger = logging.getLogger(__name__)


class GroqError(Exception):
    """Base error for Groq API failures."""


class GroqRateLimitError(GroqError):
    """Raised when Groq rate-limits us (HTTP 429)."""


def _active_keys() -> list:
    """All configured Groq keys, primary first, deduplicated."""
    keys: list = []
    for key in GroqConfig.API_KEYS:
        if key and key not in keys:
            keys.append(key)
    return keys


def is_configured() -> bool:
    """True when at least one GROQ API key is present."""
    return bool(_active_keys())


def _headers(key: str) -> dict:
    return {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _post_json(path: str, payload: dict, timeout: float = 120.0) -> dict:
    """POST JSON to Groq, retrying with backoff and rotating keys on rate limits.

    Each configured key (primary first, then backups from GROQ_API_KEYS) gets
    up to MAX_RETRIES attempts. On HTTP 429 the provider switches to the next
    key, so a rate-limited primary key no longer takes the whole app down.
    """
    url = GroqConfig.BASE_URL.rstrip("/") + path
    keys = _active_keys()
    if not keys:
        raise GroqError("GROQ_API_KEY is not set. Add it to backend/.env (see .env.example).")

    last_error: Optional[Exception] = None
    for key_index, key in enumerate(keys):
        for attempt in range(GroqConfig.MAX_RETRIES):
            try:
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, headers=_headers(key), json=payload)
                if resp.status_code == 429:
                    raise GroqRateLimitError(resp.text[:300])
                resp.raise_for_status()
                try:
                    return resp.json()
                except ValueError as exc:
                    raise GroqError(f"Groq returned non-JSON response: {resp.text[:200]}") from exc
            except GroqRateLimitError as exc:
                last_error = exc
                logger.warning(
                    "Groq key #%d rate-limited (attempt %d/%d): %s",
                    key_index + 1, attempt + 1, GroqConfig.MAX_RETRIES, exc,
                )
            except httpx.HTTPStatusError as exc:
                last_error = exc
                if exc.response.status_code == 429:
                    logger.warning(
                        "Groq key #%d rate-limited (attempt %d/%d)",
                        key_index + 1, attempt + 1, GroqConfig.MAX_RETRIES,
                    )
                else:
                    raise GroqError(f"Groq HTTP {exc.response.status_code}: {exc.response.text[:300]}") from exc
            except httpx.HTTPError as exc:
                last_error = exc
                logger.warning(
                    "Groq request failed on key #%d (attempt %d/%d): %s",
                    key_index + 1, attempt + 1, GroqConfig.MAX_RETRIES, exc,
                )

            if attempt < GroqConfig.MAX_RETRIES - 1:
                time.sleep(min(2 ** attempt, 30))

        if key_index < len(keys) - 1:
            logger.warning("Groq key #%d exhausted, rotating to backup key #%d", key_index + 1, key_index + 2)

    raise GroqError(
        f"Groq request failed after {len(keys)} key(s) x "
        f"{GroqConfig.MAX_RETRIES} attempts: {last_error}"
    ) from last_error


def _post_files(path: str, files: dict, data: dict, timeout: float = 180.0) -> dict:
    """POST multipart form data (used by STT), rotating keys on 429."""
    url = GroqConfig.BASE_URL.rstrip("/") + path
    keys = _active_keys()
    if not keys:
        raise GroqError("GROQ_API_KEY is not set. Add it to backend/.env (see .env.example).")
    last_error: Optional[Exception] = None
    for key_index, key in enumerate(keys):
        try:
            headers = {"Authorization": f"Bearer {key}"}
            with httpx.Client(timeout=timeout) as client:
                resp = client.post(url, headers=headers, files=files, data=data)
            if resp.status_code == 429:
                raise GroqRateLimitError(resp.text[:300])
            resp.raise_for_status()
            return resp.json()
        except GroqRateLimitError as exc:
            last_error = exc
            logger.warning("Groq STT key #%d rate-limited: %s", key_index + 1, exc)
        except httpx.HTTPError as exc:
            last_error = exc
            logger.warning("Groq STT request failed on key #%d: %s", key_index + 1, exc)
            if exc.response.status_code == 429:
                continue
            raise
    raise GroqError(f"Groq STT request failed after {len(keys)} key(s): {last_error}") from last_error


def chat(
    system: str,
    user: str,
    model: Optional[str] = None,
    temperature: float = 0.5,
    max_tokens: Optional[int] = None,
) -> str:
    """Plain chat completion. Returns the assistant text."""
    if not is_configured():
        raise GroqError("GROQ_API_KEY is not set. Add it to backend/.env (see .env.example).")

    payload: dict[str, Any] = {
        "model": model or GroqConfig.TEXT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if max_tokens:
        payload["max_tokens"] = max_tokens

    data = _post_json("/chat/completions", payload)
    try:
        return (data["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise GroqError(f"Unexpected Groq response shape: {str(data)[:300]}") from exc


def chat_json(system: str, user: str, model: Optional[str] = None, temperature: float = 0.3) -> Any:
    """Chat completion forced to JSON.

    Returns the parsed value (a dict, or a list when the model returns a bare
    JSON array — some of our prompts ask for arrays). Empty dict on failure.
    """
    payload: dict[str, Any] = {
        "model": model or GroqConfig.TEXT_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
        "response_format": {"type": "json_object"},
    }
    data = _post_json("/chat/completions", payload)
    try:
        raw = data["choices"][0]["message"]["content"] or "{}"
    except (KeyError, IndexError, TypeError) as exc:
        raise GroqError(f"Unexpected Groq response shape: {str(data)[:300]}") from exc
    return _parse_json(raw)


def _parse_json(raw: str) -> Any:
    """Parse model JSON, tolerating markdown fences and stray text."""
    raw = (raw or "").strip()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    start = raw.find("{")
    end = raw.rfind("}") + 1
    if 0 <= start < end:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if 0 <= start < end:
        try:
            return json.loads(raw[start:end])
        except json.JSONDecodeError:
            pass
    logger.warning("Groq returned non-JSON output: %.200s", raw)
    return {}


def _pcm16_to_wav(pcm_bytes: bytes, sample_rate: int = 24000) -> bytes:
    """Wrap 16-bit mono PCM samples in a WAV container (Whisper needs a container)."""
    import io
    import wave

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm_bytes)
    return buf.getvalue()


def transcribe(audio_bytes: bytes, mime_type: str = "audio/wav", filename: str = "audio.wav") -> str:
    """Speech-to-text with Groq Whisper. Returns the transcribed text."""
    if not is_configured():
        raise GroqError("GROQ_API_KEY is not set. Add it to backend/.env (see .env.example).")
    if mime_type.lower().startswith("audio/pcm") or mime_type.lower() == "audio/l16":
        audio_bytes = _pcm16_to_wav(audio_bytes)
        mime_type = "audio/wav"
        filename = "audio.wav"
    data = _post_files(
        "/audio/transcriptions",
        files={"file": (filename, audio_bytes, mime_type)},
        data={"model": GroqConfig.TRANSCRIPTION_MODEL},
    )
    return (data.get("text") or "").strip()


def text_to_speech(text: str) -> Optional[dict]:
    """Synthesize speech with Groq Orpheus. Returns {audio, audio_mime} or None."""
    if not is_configured():
        return None
    try:
        payload = {
            "model": GroqConfig.TTS_MODEL,
            "voice": GroqConfig.TTS_VOICE,
            "input": text,
            "response_format": "mp3",
        }
        url = GroqConfig.BASE_URL.rstrip("/") + "/audio/speech"
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(url, headers=_headers(), json=payload)
        if resp.status_code != 200:
            logger.warning("Groq TTS failed (%s): %.200s", resp.status_code, resp.text)
            return None
        return {"audio": resp.content, "audio_mime": "audio/mp3"}
    except Exception as exc:
        logger.warning("Groq TTS failed: %s", exc)
        return None
