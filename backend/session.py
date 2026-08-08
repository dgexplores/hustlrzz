"""In-process session registry (replaces no external KV for MVP)."""

from __future__ import annotations


class Session:
    def __init__(self, session_id: str, user_id: str, app_name: str = "hustlrzzv2"):
        self.id = session_id
        self.user_id = user_id
        self.app_name = app_name
        self.state: dict = {}


class SessionRegistry:
    def __init__(self):
        self._sessions: dict = {}

    async def create(self, app_name: str, user_id: str, session_id: str) -> Session:
        session = Session(session_id, user_id, app_name)
        self._sessions[(app_name, user_id, session_id)] = session
        return session

    async def get(self, app_name: str, user_id: str, session_id: str) -> Session | None:
        return self._sessions.get((app_name, user_id, session_id))

    async def delete(self, app_name: str, user_id: str, session_id: str) -> None:
        self._sessions.pop((app_name, user_id, session_id), None)


registry = SessionRegistry()