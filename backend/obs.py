"""Operational helpers: structured logging and rate limiting.

Rate limiting prefers a shared Postgres backend (Supabase RPC) so multiple
replicas enforce one budget. In-process memory remains as a fail-soft fallback
for local dev and Supabase outages — single-instance correct, multi-instance
best-effort only in that degraded mode.
"""

from __future__ import annotations

import asyncio
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
    """Per-key sliding-window limiter.

    ``allow`` is the in-process check. ``allow_async`` first tries the shared
    Postgres RPC (multi-instance) and falls back to in-process state.
    """

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

    async def allow_async(self, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
        """Shared-store check when Supabase is ready; memory fallback otherwise."""
        try:
            from backend import db

            if db.is_ready():
                client = db.get_client()

                def _rpc() -> tuple[bool, int]:
                    resp = client.rpc(
                        "rate_limit_allow",
                        {
                            "p_key": key,
                            "p_limit": limit,
                            "p_window_seconds": window_seconds,
                        },
                    ).execute()
                    row = (resp.data or [{}])[0]
                    return bool(row.get("allowed", True)), int(row.get("retry_after") or 0)

                return await asyncio.to_thread(_rpc)
        except Exception as exc:
            # Shared store down → degrade to per-process limits, never 500.
            log.warning("shared rate limit unavailable, using in-process: %s", exc)
        return self.allow(key, limit, window_seconds)


limiter = SlidingWindowLimiter()
