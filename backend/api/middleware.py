"""ASGI middlewares: request-ID tracing + in-memory rate limiting.

- RequestIDMiddleware correlates logs and responses via X-Request-ID.
- RateLimitMiddleware is a simple sliding-window limiter keyed by client IP,
  with a stricter tier for expensive AI endpoints (workflows / interviews).

For a horizontally-scaled deployment this should be replaced by a shared
store (e.g. Redis), but it is a solid defense-in-depth for the current
single-instance setup.
"""

import asyncio
import time
import uuid
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import RateLimitConfig


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Accept or generate an X-Request-ID and echo it back on the response."""

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = request_id
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window per-client rate limiter (in-memory)."""

    def __init__(self, app, config: RateLimitConfig = None):
        super().__init__(app)
        self.config = config or RateLimitConfig()
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = asyncio.Lock()

    def _tier(self, path: str) -> str:
        for prefix in self.config.HEAVY_PATHS:
            if path.startswith(prefix):
                return "heavy"
        return "default"

    def _key(self, request: Request) -> str:
        ip = request.client.host if request.client else "unknown"
        return f"{ip}:{self._tier(request.url.path)}"

    async def dispatch(self, request: Request, call_next):
        if not self.config.ENABLED:
            return await call_next(request)

        key = self._key(request)
        is_heavy = key.endswith("heavy")
        limit = (
            self.config.HEAVY_PER_MINUTE
            if is_heavy
            else self.config.DEFAULT_PER_MINUTE
        )

        now = time.monotonic()
        async with self._lock:
            window = self._hits[key]
            while window and now - window[0] > 60:
                window.popleft()
            if len(window) >= limit:
                request_id = getattr(request.state, "request_id", "-")
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests, please slow down."},
                    headers={"Retry-After": "60", "X-Request-ID": request_id},
                )
            window.append(now)

        return await call_next(request)
