"""In-process session registry with TTL expiry.

Sessions hold the WebSocket handshake token and interview state. A client that
requests a session but never connects must not leak memory forever, so entries
expire lazily: every create/get purges what is too old.
"""

from __future__ import annotations

import time


class Session:
    def __init__(self, session_id: str, user_id: str, app_name: str = "hustlrzzv2"):
        self.id = session_id
        self.user_id = user_id
        self.app_name = app_name
        self.state: dict = {}
        self.created_at: float = time.monotonic()


class SessionRegistry:
    def __init__(self, ttl_seconds: int = 3600):
        self._sessions: dict = {}
        self.ttl_seconds = ttl_seconds

    def _purge_expired(self) -> None:
        cutoff = time.monotonic() - self.ttl_seconds
        stale = [key for key, sess in self._sessions.items() if sess.created_at < cutoff]
        for key in stale:
            self._sessions.pop(key, None)

    async def create(self, app_name: str, user_id: str, session_id: str) -> Session:
        self._purge_expired()
        session = Session(session_id, user_id, app_name)
        self._sessions[(app_name, user_id, session_id)] = session
        return session

    async def get(self, app_name: str, user_id: str, session_id: str) -> Session | None:
        self._purge_expired()
        return self._sessions.get((app_name, user_id, session_id))

    async def delete(self, app_name: str, user_id: str, session_id: str) -> None:
        self._sessions.pop((app_name, user_id, session_id), None)


registry = SessionRegistry(ttl_seconds=3600)
