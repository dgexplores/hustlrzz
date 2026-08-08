"""Multi-provider LLM layer.

Preferred provider is runtime-switchable via config.AI_PROVIDER:
  - "groq": fast, free tier (no credit card), good daily quota
  - "gemini": google gemini flash (adds vision + long context)

Every downstream agent talks to ``chat`` / ``chat_json`` only, so the
interviewer, judge, summarizer and analysis modules stay provider-agnostic.
"""

from __future__ import annotations

import json
import re
from typing import Any

from backend import config


class ProviderError(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(_providers())


# --------------------------------------------------------------------------- #
# Raw per-provider call
# --------------------------------------------------------------------------- #
def _groq_chat(system: str, user: str, temperature: float = 0.4) -> str:
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY)
    resp = client.chat.completions.create(
        model=config.GROQ_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
    )
    return (resp.choices[0].message.content or "").strip()


def _gemini_chat(system: str, user: str, temperature: float = 0.4) -> str:
    import google.generativeai as genai

    genai.configure(api_key=config.GEMINI_API_KEY)
    model = genai.GenerativeModel(
        config.GEMINI_MODEL,
        system_instruction=system,
    )
    resp = model.generate_content(user, generation_config={
        "temperature": temperature,
    })
    return (resp.text or "").strip()


def _providers() -> list[str]:
    """Active providers, preferred first."""
    order = [config.AI_PROVIDER]
    for other in ("groq", "gemini"):
        if other not in order:
            order.append(other)
    return [p for p in order if {
        "groq": config.GROQ_API_KEY,
        "gemini": config.GEMINI_API_KEY,
    }.get(p)]


# --------------------------------------------------------------------------- #
# Public helpers
# --------------------------------------------------------------------------- #
def chat(system: str, user: str, temperature: float = 0.4) -> str:
    """Single text completion. Auto-falls back across configured providers."""
    provider = _providers() or []
    if not provider:
        raise ProviderError(
            f"AI not configured: set GROQ_API_KEY and/or GEMINI_API_KEY in backend/.env"
        )
    last_err: Exception | None = None
    for name in provider:
        try:
            if name == "gemini":
                return _gemini_chat(system, user, temperature)
            return _groq_chat(system, user, temperature)
        except Exception as exc:
            last_err = exc
            # Rate-limit / quota / auth → try the next provider.
            continue
    raise ProviderError(f"All AI providers failed (last: {last_err})") from last_err


def extract_json(text: str) -> Any:
    """Best-effort JSON parse that tolerates code fences and stray prose."""
    if not text:
        return {}
    try:
        fence = re.findall(r"```(?:json)?\s*(.*?)\s*```", text, re.DOTALL)
        if fence:
            return json.loads(fence[0])
        return json.loads(text)
    except Exception:
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            if 0 <= start < end:
                return json.loads(text[start:end])
        except Exception as exc:
            return {"error": f"Could not parse model JSON: {exc}", "raw": text}
    return {"error": "Empty or non-JSON model response"}


def chat_json(system: str, user: str, temperature: float = 0.4) -> Any:
    """Completion forced through JSON extraction."""
    return extract_json(chat(system, user, temperature))


def chat_json_strict(system: str, user: str) -> Any:
    """Completion with lower temperature for structured output."""
    return extract_json(chat(system, user, temperature=0.2))