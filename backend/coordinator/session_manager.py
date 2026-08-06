"""In-process session registry for interviews and workflows.

Replaces the Google ADK session service with a lightweight equivalent:
every agent keeps its conversational state in ``session.state``.
"""


class SimpleSession:
    """A session object with the same surface used across the app."""

    def __init__(self, session_id: str, user_id: str, app_name: str = "Hustlrzz"):
        self.id = session_id
        self.user_id = user_id
        self.app_name = app_name
        self.state: dict = {}


class SessionService:
    def __init__(self):
        self._sessions: dict = {}

    async def create_session(self, app_name: str, user_id: str, session_id: str) -> SimpleSession:
        session = SimpleSession(session_id, user_id, app_name)
        self._sessions[(app_name, user_id, session_id)] = session
        return session

    async def get_session(self, app_name: str, user_id: str, session_id: str):
        return self._sessions.get((app_name, user_id, session_id))

    async def delete_session(self, app_name: str, user_id: str, session_id: str) -> None:
        self._sessions.pop((app_name, user_id, session_id), None)


session_service = SessionService()
