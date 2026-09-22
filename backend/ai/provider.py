"""Multi-provider LLM layer.

Preferred provider is runtime-switchable via config.AI_PROVIDER:
  - "groq": fast, free tier (no credit card), good daily quota
  - "gemini": google gemini flash (adds vision + long context)
  - "openai": OpenAI API (or any OpenAI-compatible via OPENAI_BASE_URL)
  - "openrouter": one key, many models via OpenRouter

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


RATE_LIMIT_HINTS = ("429", "rate limit", "rate_limit", "quota", "overloaded", "capacity")


def is_rate_limit_error(exc: BaseException) -> bool:
    message = str(exc).lower()
    return any(hint in message for hint in RATE_LIMIT_HINTS)


def is_configured() -> bool:
    return bool(_providers())


def _keyed_providers() -> dict[str, str]:
    return {
        "groq": config.GROQ_API_KEY,
        "gemini": config.GEMINI_API_KEY,
        "openai": config.OPENAI_API_KEY,
        "openrouter": config.OPENROUTER_API_KEY,
    }


# --------------------------------------------------------------------------- #
# Raw per-provider call
# --------------------------------------------------------------------------- #
def _groq_chat(system: str, user: str, temperature: float = 0.4) -> str:
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY, timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
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
    }, request_options={"timeout": config.AI_REQUEST_TIMEOUT_SECONDS})
    return (resp.text or "").strip()


def _openai_compat_settings(name: str) -> tuple[str, str, str]:
    """(base_url, api_key, model) for OpenAI-compatible HTTP providers."""
    if name == "openrouter":
        return config.OPENROUTER_BASE_URL, config.OPENROUTER_API_KEY, config.OPENROUTER_MODEL
    if name == "openai":
        return config.OPENAI_BASE_URL, config.OPENAI_API_KEY, config.OPENAI_MODEL
    raise ProviderError(f"not an openai-compatible provider: {name}")


def _openai_compat_chat_messages(
    name: str,
    messages: list[dict],
    temperature: float = 0.4,
    tools: list[dict] | None = None,
) -> dict:
    import httpx

    base_url, api_key, model = _openai_compat_settings(name)
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    response = httpx.post(
        f"{base_url}/chat/completions",
        json=payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=config.AI_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    message = (response.json().get("choices") or [{}])[0].get("message") or {}
    tool_calls = []
    for call in message.get("tool_calls") or []:
        function = call.get("function") or {}
        tool_calls.append({
            "id": call.get("id") or "",
            "name": function.get("name") or "",
            "arguments": function.get("arguments") or "{}",
        })
    return {"content": (message.get("content") or "").strip(), "tool_calls": tool_calls}


def _openai_compat_chat(name: str, system: str, user: str, temperature: float) -> str:
    result = _openai_compat_chat_messages(
        name,
        [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature,
    )
    return result.get("content") or ""


def _providers() -> list[str]:
    """Active providers, preferred first."""
    keys = _keyed_providers()
    fallbacks = ("groq", "openai", "openrouter", "gemini")
    order = [config.AI_PROVIDER] + [p for p in fallbacks if p != config.AI_PROVIDER]
    return [p for p in order if keys.get(p)]


# --------------------------------------------------------------------------- #
# Public helpers
# --------------------------------------------------------------------------- #
def chat(system: str, user: str, temperature: float = 0.4) -> str:
    """Single text completion. Auto-falls back across configured providers."""
    provider = _providers() or []
    if not provider:
        raise ProviderError(
            "AI not configured: set GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY "
            "and/or OPENROUTER_API_KEY in backend/.env"
        )
    last_err: Exception | None = None
    for name in provider:
        try:
            if name == "gemini":
                return _gemini_chat(system, user, temperature)
            if name == "groq":
                return _groq_chat(system, user, temperature)
            return _openai_compat_chat(name, system, user, temperature)
        except Exception as exc:
            last_err = exc
            # Rate-limit / quota / auth → try the next provider.
            continue
    raise ProviderError(f"All AI providers failed (last: {last_err})") from last_err


def _groq_chat_messages(
    messages: list[dict],
    temperature: float = 0.4,
    tools: list[dict] | None = None,
) -> dict:
    """Multi-turn (optionally tool-enabled) Groq call in OpenAI message format."""
    from groq import Groq

    client = Groq(api_key=config.GROQ_API_KEY, timeout=config.AI_REQUEST_TIMEOUT_SECONDS)
    kwargs: dict[str, Any] = {
        "model": config.GROQ_MODEL,
        "messages": messages,
        "temperature": temperature,
    }
    if tools:
        kwargs["tools"] = tools
        kwargs["tool_choice"] = "auto"
    resp = client.chat.completions.create(**kwargs)
    message = resp.choices[0].message
    tool_calls = []
    for call in message.tool_calls or []:
        tool_calls.append({
            "id": getattr(call, "id", "") or "",
            "name": call.function.name,
            "arguments": call.function.arguments or "{}",
        })
    return {"content": (message.content or "").strip(), "tool_calls": tool_calls}


def _gemini_chat_messages(
    messages: list[dict],
    temperature: float = 0.4,
    tools: list[dict] | None = None,
) -> dict:
    """Multi-turn Gemini call, converting OpenAI-style messages to genai history."""
    import google.generativeai as genai

    genai.configure(api_key=config.GEMINI_API_KEY)
    system = "\n".join(
        str(m.get("content") or "") for m in messages if m.get("role") == "system"
    )
    model_kwargs: dict[str, Any] = {"system_instruction": system} if system else {}
    if tools:
        declarations = []
        for tool in tools:
            fn = tool["function"] if tool.get("type") == "function" else tool
            declarations.append({
                "name": fn["name"],
                "description": fn.get("description", ""),
                "parameters": fn.get("parameters", {"type": "object", "properties": {}}),
            })
        model_kwargs["tools"] = [{"function_declarations": declarations}]
    model = genai.GenerativeModel(config.GEMINI_MODEL, **model_kwargs)

    convo = [m for m in messages if m.get("role") != "system"]
    if not convo:
        raise ProviderError("gemini: empty message history")

    converted: list[dict] = []
    index = 0
    while index < len(convo):
        msg = convo[index]
        role = msg.get("role")
        if role == "tool":
            parts = []
            while index < len(convo) and convo[index].get("role") == "tool":
                tool_msg = convo[index]
                try:
                    payload = json.loads(tool_msg.get("content") or "{}")
                except Exception:
                    payload = {"error": "invalid tool payload"}
                if not isinstance(payload, dict):
                    payload = {"result": payload}
                parts.append({
                    "function_response": {
                        "name": tool_msg.get("name") or "web_search",
                        "response": payload,
                    },
                })
                index += 1
            converted.append({"role": "user", "parts": parts})
            continue
        if role == "assistant":
            parts = []
            text = str(msg.get("content") or "").strip()
            if text:
                parts.append({"text": text})
            for call in msg.get("tool_calls") or []:
                fn = call.get("function") or call
                try:
                    args = json.loads(fn.get("arguments") or "{}")
                except Exception:
                    args = {}
                parts.append({"function_call": {"name": fn.get("name", ""), "args": args}})
            if parts:
                converted.append({"role": "model", "parts": parts})
        else:
            converted.append({"role": "user", "parts": [{"text": str(msg.get("content") or "")}]})
        index += 1

    if not converted:
        raise ProviderError("gemini: no convertible messages")

    history = converted[:-1]
    last_parts = converted[-1]["parts"]
    chat = model.start_chat(history=history)
    resp = chat.send_message(
        last_parts[0] if len(last_parts) == 1 else last_parts,
        generation_config={"temperature": temperature},
        request_options={"timeout": config.AI_REQUEST_TIMEOUT_SECONDS},
    )
    content = ""
    tool_calls: list[dict] = []
    try:
        for part in resp.candidates[0].content.parts or []:
            fn_call = getattr(part, "function_call", None)
            if fn_call and fn_call.name:
                tool_calls.append({
                    "id": f"call_{fn_call.name}_{len(tool_calls)}",
                    "name": fn_call.name,
                    "arguments": json.dumps(dict(fn_call.args or {})),
                })
            text = getattr(part, "text", None)
            if text:
                content += text
    except Exception:
        content = getattr(resp, "text", "") or ""
    return {"content": content.strip(), "tool_calls": tool_calls}


def chat_messages(
    messages: list[dict],
    temperature: float = 0.4,
    tools: list[dict] | None = None,
) -> dict:
    """Multi-turn completion with optional tool calling. Returns {content, tool_calls}.

    Auto-falls back across configured providers, same contract as chat().
    """
    names = _providers() or []
    if not names:
        raise ProviderError(
            "AI not configured: set GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY "
            "and/or OPENROUTER_API_KEY in backend/.env"
        )
    last_err: Exception | None = None
    for name in names:
        try:
            if name == "gemini":
                return _gemini_chat_messages(messages, temperature, tools)
            if name == "groq":
                return _groq_chat_messages(messages, temperature, tools)
            return _openai_compat_chat_messages(name, messages, temperature, tools)
        except Exception as exc:
            last_err = exc
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