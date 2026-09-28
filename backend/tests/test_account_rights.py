"""Data subject rights: export and erasure.

The erasure path is the destructive one, so these tests are mostly about what it
must *not* do: not touch another user's rows, not touch shared company research,
and not delete the login if any data table failed.
"""

import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.ai import keyring

UID = "u1"
OTHER = "u2"

# Mirrors the live PostgREST table list, minus company_intelligence (shared) and
# rate_limit_events (no user_id column, keyed "<scope>:<uid>").
LIVE_USER_TABLES = [
    "assessment_attempts",
    "drill_reviews",
    "interview_sessions",
    "knowledge_chunks",
    "knowledge_documents",
    "practice_sessions",
    "product_events",
    "profiles",
    "report_feedback",
    "resume_analysis",
    "resume_usage",
    "user_ai_keys",
    "workflows",
]


class _Async:
    def __init__(self, fn):
        self.fn = fn

    def __call__(self, *a, **k):
        return self.fn(*a, **k)


class _Db:
    """In-memory stand-in that filters by user_id the way PostgREST does."""

    def __init__(self):
        self.rows: dict[str, list[dict]] = {}
        self.deleted: list[tuple[str, dict]] = []
        self.like_deleted: list[tuple[str, str]] = []
        self.fail_on: set[str] = set()
        for t in LIVE_USER_TABLES:
            self.rows[t] = [
                {"user_id": UID, "id": f"{t}-own"},
                {"user_id": OTHER, "id": f"{t}-foreign"},
            ]
        # Ciphertext that must never appear in an export.
        self.rows["user_ai_keys"][0]["encrypted_key"] = "SUPER_SECRET_CIPHERTEXT"
        # Shared company research: no user_id, must survive every erasure.
        self.rows["company_intelligence"] = [{"id": "acme", "data": "{}"}]
        self.rows["rate_limit_events"] = [
            {"key": f"knowledge:{UID}"},
            {"key": f"knowledge:{OTHER}"},
        ]

    def select_where(self, table, match=None, order=None):
        rows = self.rows.get(table, [])
        if not match:
            return list(rows)
        return [r for r in rows if all(r.get(k) == v for k, v in match.items())]

    def delete_where(self, table, match):
        if table in self.fail_on:
            raise RuntimeError(f"simulated failure on {table}")
        self.deleted.append((table, dict(match or {})))
        kept = [
            r for r in self.rows.get(table, []) if not all(r.get(k) == v for k, v in (match or {}).items())
        ]
        self.rows[table] = kept
        return kept

    def select_where_like(self, table, column, pattern):
        import fnmatch

        pat = pattern.replace("*", "*")
        return [r for r in self.rows.get(table, []) if fnmatch.fnmatch(r.get(column, ""), pat)]

    def delete_where_like(self, table, column, pattern):
        if table in self.fail_on:
            raise RuntimeError("simulated failure on rate_limit_events")
        import fnmatch

        self.like_deleted.append((table, pattern))
        before = len(self.rows.get(table, []))
        kept = [r for r in self.rows.get(table, []) if not fnmatch.fnmatch(r.get(column, ""), pattern)]
        self.rows[table] = kept
        return before - len(kept)


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(config, "AI_KEYS_ENCRYPTION_KEY", "")
    monkeypatch.setattr(keyring, "is_enabled", lambda: False)

    from backend import app as app_module
    from backend.obs import limiter as _limiter

    # Isolate the limiter. It falls back to in-process counters here, and the
    # erasure limit is deliberately low (3/hour), so tests that fire several
    # requests would otherwise 429 on each other. Tests that care about the
    # limit override this to deny.
    _limiter._events.clear()

    async def _allow(key, limit, window):
        return True, 0

    monkeypatch.setattr(app_module.limiter, "allow_async", _allow)

    db = _Db()
    monkeypatch.setattr(app_module.dbc, "is_ready", lambda: True)
    monkeypatch.setattr(app_module.dbc, "get_client", lambda: object())
    monkeypatch.setattr(app_module.dbc, "select_where", db.select_where)
    monkeypatch.setattr(app_module.dbc, "delete_where", db.delete_where)
    monkeypatch.setattr(app_module.dbc, "select_where_like", db.select_where_like)
    monkeypatch.setattr(app_module.dbc, "delete_where_like", db.delete_where_like)
    monkeypatch.setattr(app_module.provider, "set_request_keys", lambda keys: None)
    monkeypatch.setattr(app_module.provider, "reset_request_keys", lambda token: None)

    auth_deleted: list[str] = []
    monkeypatch.setattr(
        app_module, "_delete_auth_user", lambda uid: auth_deleted.append(uid)
    )

    app_module.app.dependency_overrides[app_module.get_user] = lambda: {
        "uid": UID,
        "email": "",
        "name": "",
        "picture": "",
    }
    with TestClient(app_module.app) as c:
        c.db = db
        c.auth_deleted = auth_deleted
        yield c
    app_module.app.dependency_overrides.clear()


class TestCoverage:
    def test_erasure_list_covers_every_user_scoped_table(self):
        """A table added later and not listed here would silently under-erase."""
        from backend.app import _USER_DATA_TABLES

        missing = set(LIVE_USER_TABLES) - set(_USER_DATA_TABLES)
        assert not missing, f"not erased on account deletion: {sorted(missing)}"

    def test_shared_company_intelligence_is_not_in_the_list(self):
        from backend.app import _USER_DATA_TABLES

        assert "company_intelligence" not in _USER_DATA_TABLES

    def test_children_are_erased_before_parents(self):
        """knowledge_chunks references knowledge_documents."""
        from backend.app import _USER_DATA_TABLES

        assert _USER_DATA_TABLES.index("knowledge_chunks") < _USER_DATA_TABLES.index(
            "knowledge_documents"
        )


class TestExport:
    def test_returns_only_the_callers_rows(self, env):
        res = env.get("/account/export")
        assert res.status_code == 200
        tables = res.json()["data"]["tables"]
        for name, rows in tables.items():
            for row in rows:
                assert row.get("user_id") == UID, f"{name} leaked another user's row"

    def test_redacts_stored_key_ciphertext(self, env):
        body = env.get("/account/export").text
        assert "SUPER_SECRET_CIPHERTEXT" not in body
        assert "encrypted_key" not in body

    def test_still_reports_the_key_hint(self, env):
        rows = env.get("/account/export").json()["data"]["tables"]["user_ai_keys"]
        assert rows and "id" in rows[0]


class TestEraseConfirmation:
    def test_requires_the_exact_confirmation(self, env):
        for wrong in ["", "delete", "Delete", "DELETE ", "yes", "DELETE ME"]:
            res = env.request("DELETE", "/account", json={"confirm": wrong})
            assert res.status_code == 422, f"{wrong!r} was accepted"
        assert not env.auth_deleted

    def test_accepts_exact_confirmation(self, env):
        res = env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert res.status_code == 200


class TestErasure:
    def test_clears_every_user_table(self, env):
        res = env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert res.status_code == 200
        cleared = res.json()["data"]["cleared"]
        for table in LIVE_USER_TABLES:
            assert table in cleared, f"{table} not reported as cleared"
            assert cleared[table] == 1, f"{table} reported {cleared[table]} rows"
            remaining = env.db.rows[table]
            assert all(r.get("user_id") != UID for r in remaining), f"{table} kept the caller's row"

    def test_leaves_other_users_rows_untouched(self, env):
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        for table in LIVE_USER_TABLES:
            foreign = [r for r in env.db.rows[table] if r.get("user_id") == OTHER]
            assert foreign, f"{table} lost another user's row"

    def test_preserves_shared_company_intelligence(self, env):
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert env.db.rows["company_intelligence"], "shared company research was deleted"
        assert not any(t == "company_intelligence" for t, _ in env.db.deleted)

    def test_clears_only_this_users_rate_limit_keys(self, env):
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        keys = [r["key"] for r in env.db.rows["rate_limit_events"]]
        assert f"knowledge:{UID}" not in keys
        assert f"knowledge:{OTHER}" in keys

    def test_reports_the_actual_rate_limit_count(self, env):
        """The response is an audit record; it must not overstate what it cleared."""
        cleared = env.request("DELETE", "/account", json={"confirm": "DELETE"}).json()["data"]["cleared"]
        assert cleared["rate_limit_events"] == 1

    def test_deletes_the_login(self, env):
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert env.auth_deleted == [UID]

    def test_login_is_deleted_after_the_data(self, env):
        """A login removed first would make the remaining deletes unauthenticated."""
        order: list[str] = []
        env.db.delete_where = lambda t, m: (order.append(f"data:{t}"), None)[1]
        from backend import app as app_module

        app_module._delete_auth_user = lambda uid: order.append("auth")
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert order[-1] == "auth"
        assert all(not o.startswith("data:") for o in order[order.index("auth") :])


class TestPartialFailure:
    def test_a_failing_table_stops_the_login_deletion(self, env):
        env.db.fail_on = {"workflows"}
        res = env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert res.status_code == 500
        assert "workflows" in res.json()["detail"]["failed"]
        assert not env.auth_deleted, "login was removed while data remained"

    def test_a_failing_table_does_not_stop_the_other_deletes(self, env):
        env.db.fail_on = {"workflows"}
        env.request("DELETE", "/account", json={"confirm": "DELETE"})
        # Everything except the failing table is still attempted.
        for table in LIVE_USER_TABLES:
            if table == "workflows":
                continue
            assert all(r.get("user_id") != UID for r in env.db.rows[table]), f"{table} skipped"

    def test_failure_response_names_what_did_clear(self, env):
        env.db.fail_on = {"workflows"}
        detail = env.request("DELETE", "/account", json={"confirm": "DELETE"}).json()["detail"]
        assert "profiles" in detail["cleared"]
        assert "workflows" in detail["failed"]


class TestRateLimiting:
    def test_erasure_is_rate_limited(self, env, monkeypatch):
        """A destructive endpoint must not be freely repeatable."""
        from backend import app as app_module

        async def _deny(key, limit, window):
            return False, 900

        monkeypatch.setattr(app_module.limiter, "allow_async", _deny)
        res = env.request("DELETE", "/account", json={"confirm": "DELETE"})
        assert res.status_code == 429
        assert res.headers.get("Retry-After")
        assert not env.auth_deleted

    def test_export_is_rate_limited(self, env, monkeypatch):
        from backend import app as app_module

        async def _deny(key, limit, window):
            return False, 900

        monkeypatch.setattr(app_module.limiter, "allow_async", _deny)
        assert env.get("/account/export").status_code == 429
