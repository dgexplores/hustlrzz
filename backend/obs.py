"""Operational helpers: structured logging and in-process rate limiting.

Everything here is intentionally dependency-free so it keeps working on any
single-instance deployment (Railway free tier, Docker, local dev).
"""

from __future__ import annotations

import logging
import sys
import time
from collections import defaultdict, deque

_CONFIGURED = False


def get_logger(name: str) -> logging.Logger:
    global _CONFIGURED
    if not _CONFIGURED:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s"
        ))
        root = logging.getLogger()
        root.handlers = [handler]
        root.setLevel(logging.INFO)
        _CONFIGURED = True
    return logging.getLogger(name)


log = get_logger("hustlrzz")


class SlidingWindowLimiter:
    """Per-key sliding-window request limiter (in-memory, single instance)."""

    def __init__(self) -> None:
        self._events: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        now = time.monotonic()
        events = self._events[key]
        cutoff = now - window_seconds
        while events and events[0] < cutoff:
            events.popleft()
        if len(events) >= limit:
            retry_after = max(1, int(window_seconds - (now - events[0])) + 1)
            return False, retry_after
        events.append(now)
        # Opportunistic cleanup keeps idle keys from holding memory forever.
        if len(self._events) > 10_000:
            stale = [k for k, q in self._events.items() if not q or now - q[-1] > 3600]
            for k in stale[:2000]:
                self._events.pop(k, None)
        return True, 0


limiter = SlidingWindowLimiter()
