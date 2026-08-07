"""Shared SSRF guard for user-supplied URLs.

Anything the server fetches on the user's behalf (currently the portfolio
scraper) must not be allowed to target internal infrastructure (loopback,
private ranges, link-local, metadata endpoints). This module is used both at
API validation time (backend/api/routes.py) and right before the fetch
(backend/services/portfolio/web_scraper.py) as defense in depth.
"""

import ipaddress
import socket
from typing import Optional
from urllib.parse import urlparse

from pydantic import HttpUrl


def is_blocked_host(host: str) -> bool:
    """Return True when a host must never be fetched server-side."""
    host = (host or "").strip().lower()
    if not host:
        return True
    # Explicit blocklist for obvious internal targets
    if host in ("localhost", "metadata.google.internal", "metadata"):
        return True
    if host.endswith(".local") or host.endswith(".internal"):
        return True
    # Reject private / loopback / link-local / reserved / multicast IP literals
    try:
        ip = ipaddress.ip_address(host)
        return (
            ip.is_private or ip.is_loopback or ip.is_link_local
            or ip.is_reserved or ip.is_multicast
        )
    except ValueError:
        pass
    # Hostname: resolve and reject if ANY address is an internal IP
    try:
        for info in socket.getaddrinfo(host, None):
            try:
                ip = ipaddress.ip_address(info[4][0])
                if (
                    ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast
                ):
                    return True
            except ValueError:
                continue
    except OSError:
        # Unresolvable hostnames are rejected rather than fetched
        return True
    return False


def validate_public_url(value: str) -> Optional[str]:
    """Validate a URL string; returns the normalized URL or None if unsafe.

    Rejects malformed URLs and any host that is internal/private (SSRF).
    """
    value = (value or "").strip()
    if not value:
        return None
    try:
        normalized = str(HttpUrl(value))
    except Exception:
        return None
    host = urlparse(normalized).hostname or ""
    if is_blocked_host(host):
        return None
    return normalized
