"""Shared DuckDuckGo retrieval used by preparation and company intelligence.

Search is best-effort by design: every failure path returns an empty list and
callers fall back to built-in knowledge. ``fetch_page_text`` is the SSRF-safe
page reader used by the grounding fetch_page tool.
"""

from __future__ import annotations

import html
import ipaddress
import re
import socket
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx

from backend import config
from backend.obs import log


def clean_web_results(results: list[dict], limit: int = 24) -> list[dict]:
    """Keep only unique, attributable HTTP sources before they reach the model."""
    cleaned: list[dict] = []
    seen: set[str] = set()
    for item in results:
        url = str(item.get("url") or item.get("href") or "").strip()
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or url in seen:
            continue
        title = str(item.get("title") or parsed.netloc).strip()[:240]
        snippet = str(item.get("snippet") or item.get("body") or "").strip()[:1200]
        if not snippet:
            continue
        seen.add(url)
        cleaned.append({
            "id": f"S{len(cleaned) + 1}",
            "title": title,
            "url": url,
            "domain": parsed.netloc.removeprefix("www."),
            "snippet": snippet,
            "published_at": str(item.get("date") or item.get("published_at") or "")[:80],
            "query": str(item.get("query") or "")[:240],
            "category": str(item.get("category") or "general")[:80],
        })
        if len(cleaned) >= limit:
            break
    return cleaned


def search_company_web(company_name: str, job_title: str = "", max_results: int = 5) -> list[dict]:
    """Retrieve an on-demand, multi-angle company interview evidence set."""
    year = datetime.now(timezone.utc).year
    role_clause = f' "{job_title}"' if job_title else ""
    queries = [
        ("role_demand", f'"{company_name}"{role_clause} careers jobs requirements skills'),
        ("hiring_process", f'"{company_name}" interview process hiring process careers'),
        ("question_patterns", f'"{company_name}"{role_clause} interview questions technical behavioral'),
        ("candidate_experience", f'"{company_name}"{role_clause} interview experience stages rounds'),
        ("values_culture", f'"{company_name}" official values leadership principles culture'),
        ("engineering_product", f'"{company_name}" engineering blog product strategy {year}'),
        ("business_priorities", f'"{company_name}" annual report investor priorities {year}'),
        ("aptitude_rounds", f'"{company_name}" placement aptitude test online assessment rounds pattern'),
    ]
    results: list[dict] = []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            for category, query in queries:
                try:
                    for item in ddgs.text(query, max_results=max_results):
                        results.append({**item, "query": query, "category": category})
                except Exception:
                    continue
            try:
                for item in ddgs.news(
                    f'"{company_name}" hiring strategy product engineering',
                    timelimit="m",
                    max_results=max_results,
                ):
                    results.append({**item, "query": "recent company news", "category": "recent_news"})
            except Exception:
                pass
    except Exception as exc:
        log.warning("company search failed: %s", exc)

    company_token = "".join(character for character in company_name.lower() if character.isalnum())

    def source_priority(item: dict) -> tuple[int, str]:
        url = str(item.get("url") or item.get("href") or "").lower()
        domain_token = "".join(character for character in urlparse(url).netloc.lower() if character.isalnum())
        query = str(item.get("query") or "").lower()
        category = str(item.get("category") or "")
        score = 0
        if company_token and company_token in domain_token:
            score += 8
        if any(term in url for term in ("career", "jobs", "investor", "annual-report", "about")):
            score += 3
        if "careers" in query or "annual report" in query:
            score += 2
        if category in {"role_demand", "hiring_process", "business_priorities", "aptitude_rounds", "question_patterns"}:
            score += 1
        if item.get("date"):
            score += 1
        return (-score, url)

    return clean_web_results(sorted(results, key=source_priority))


def search_industry_questions(job_title: str, max_results: int = 5) -> list[dict]:
    queries = [
        (f"{job_title} interview questions", "questions"),
        (f"{job_title} common interview questions and answers", "questions"),
        (f"{job_title} behavioral interview questions", "behavioral"),
        (f"{job_title} technical interview questions", "technical"),
    ]
    results: list[dict] = []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            for query, category in queries:
                try:
                    for item in ddgs.text(query, max_results=max_results):
                        results.append({
                            "title": item.get("title", ""),
                            "url": item.get("href", ""),
                            "snippet": item.get("body", ""),
                            "query": query,
                            "category": category,
                        })
                except Exception:
                    continue
    except Exception as exc:
        log.warning("industry question search failed: %s", exc)
    return results


def search_web(query: str, max_results: int = 6) -> list[dict]:
    """Single-query DuckDuckGo search for the agent web_search tool.

    Best-effort: every failure path returns an empty list so the LLM loop
    continues without grounding rather than failing the request.
    """
    query = str(query or "").strip()[:300]
    if not query or not search_enabled():
        return []
    try:
        from ddgs import DDGS

        with DDGS() as ddgs:
            items = list(ddgs.text(query, max_results=max_results))
    except Exception as exc:
        log.warning("web_search tool failed: %s", exc)
        return []
    return clean_web_results(
        [{**item, "query": query, "category": "live_search"} for item in items],
        limit=max_results,
    )


def search_enabled() -> bool:
    return config.ENABLE_WEB_SEARCH


# --------------------------------------------------------------------------- #
# fetch_page tool (SSRF-hardened)
# --------------------------------------------------------------------------- #
_SAFE_SCHEMES = {"http", "https"}
_CONTENT_TYPES = ("text/html", "text/plain", "application/xhtml", "application/xml")
_MAX_REDIRECTS = 3
_TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
_TAG_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.I | re.S)
_ANY_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


class FetchBlocked(Exception):
    """URL failed SSRF / policy validation."""


def _is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def _resolve_public_ips(hostname: str, port: int) -> list[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    """Resolve hostname once; every record must be a public address.

    Fails closed: a single private/reserved answer (e.g. rebinding attempt)
    rejects the whole hostname.
    """
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        raise FetchBlocked("local hostnames are blocked")
    try:
        infos = socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise FetchBlocked(f"could not resolve host: {exc}") from exc
    if not infos:
        raise FetchBlocked("could not resolve host")
    addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError as exc:
            raise FetchBlocked("unparsable resolved address") from exc
        if not _is_public_ip(ip):
            raise FetchBlocked("resolved to a non-public address")
        if ip not in addresses:
            addresses.append(ip)
    return addresses


def _assert_safe_url(url: str) -> str:
    """Validate scheme + resolution policy (kept for direct callers/tests)."""
    _pin_url(url)
    return url


def _pin_url(url: str) -> tuple[str, str, str]:
    """Validate URL once and pin the connection to a single resolved IP.

    Returns (pinned_url, host_header, sni_hostname). DNS is resolved exactly
    once here; the subsequent request connects to that literal IP, so a
    short-TTL rebinding between check and connect cannot redirect the socket
    to an internal address (TOCTOU gap closed).
    """
    parsed = urlparse(url)
    if parsed.scheme not in _SAFE_SCHEMES or not parsed.hostname:
        raise FetchBlocked("only absolute http(s) URLs are allowed")
    hostname = parsed.hostname.lower()
    default_port = 443 if parsed.scheme == "https" else 80
    port = parsed.port or default_port
    addresses = _resolve_public_ips(hostname, port)
    pinned = addresses[0]
    host_in_url = f"[{pinned}]" if pinned.version == 6 else str(pinned)
    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"
    pinned_url = f"{parsed.scheme}://{host_in_url}:{port}{path}"
    host_header = hostname if port == default_port else f"{hostname}:{port}"
    return pinned_url, host_header, hostname


def _html_to_text(raw: bytes) -> tuple[str, str]:
    document = raw.decode("utf-8", errors="replace")
    title_match = _TITLE_RE.search(document)
    title = _WS_RE.sub(" ", html.unescape(title_match.group(1))).strip()[:240] if title_match else ""
    body = _TAG_RE.sub(" ", document)
    body = _ANY_TAG_RE.sub(" ", body)
    text = _WS_RE.sub(" ", html.unescape(body)).strip()
    return title, text[: config.PAGE_FETCH_MAX_CHARS]


def fetch_page_text(url: str) -> dict:
    """Fetch one public page and return readable text. Never raises.

    Policy: http(s) only, public IPs only (validated on every redirect hop),
    no cookies/JS, size- and time-capped, HTML stripped to plain text.
    """
    url = str(url or "").strip()
    if not url:
        return {"error": "empty url"}
    if not search_enabled():
        return {"error": "web tools disabled"}
    current = url
    raw = b""
    try:
        with httpx.Client(
            follow_redirects=False,
            timeout=config.PAGE_FETCH_TIMEOUT_SECONDS,
            headers={
                "User-Agent": "hustlrzz-research/1.0 (+https://hustlrzz.vercel.app)",
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
            },
        ) as client:
            for _hop in range(_MAX_REDIRECTS + 1):
                pinned_url, host_header, sni = _pin_url(current)
                with client.stream(
                    "GET",
                    pinned_url,
                    headers={"Host": host_header},
                    extensions={"sni_hostname": sni},
                ) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location:
                            return {"error": "redirect without location"}
                        current = urljoin(current, location)
                        continue
                    if response.status_code >= 400:
                        return {"error": f"http {response.status_code}", "url": current}
                    content_type = (response.headers.get("content-type") or "").lower()
                    if not any(allowed in content_type for allowed in _CONTENT_TYPES):
                        return {"error": f"unsupported content-type: {content_type[:80]}", "url": current}
                    chunks: list[bytes] = []
                    total = 0
                    for chunk in response.iter_bytes():
                        total += len(chunk)
                        if total > config.PAGE_FETCH_MAX_BYTES:
                            break
                        chunks.append(chunk)
                    raw = b"".join(chunks)[: config.PAGE_FETCH_MAX_BYTES]
                    break
            else:
                return {"error": "too many redirects", "url": url}
            title, text = _html_to_text(raw)
            if not text:
                return {"error": "no readable text", "url": current}
            return {
                "url": current,
                "title": title,
                "text": text,
                "bytes": len(raw),
            }
    except FetchBlocked as exc:
        log.warning("fetch_page blocked %s: %s", url, exc)
        return {"error": f"blocked: {exc}", "url": url}
    except Exception as exc:
        log.warning("fetch_page failed %s: %s", url, exc)
        return {"error": f"fetch failed: {exc}", "url": url}
