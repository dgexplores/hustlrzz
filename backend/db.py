"""Supabase persistence layer (Postgres, Row-Level Security).

Server-side access uses the service-role key. Tables mirror supabase/schema.sql.
"""

from __future__ import annotations

import threading
import time
import httpx

from supabase import create_client
from supabase.lib.client_options import ClientOptions

from backend import config

_client = None
_ready = False
_probe_lock = threading.Lock()
_probe_until = 0.0
_probe_ready = False


def get_client():
    global _client, _ready
    if _client is None:
        if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY):
            _ready = False
            return None
        try:
            _client = create_client(
                config.SUPABASE_URL,
                config.SUPABASE_SERVICE_ROLE_KEY,
                options=ClientOptions(postgrest_client_timeout=30),
            )
        except Exception:
            # Bad/rotated key must degrade to "not ready" (503s with a clear
            # message), never crash the process or the /health check that
            # deploy platforms use to decide the service is alive.
            _client = None
            _ready = False
            return None
        _ready = True
    return _client


def is_ready() -> bool:
    get_client()
    return _ready


def check_connectivity() -> bool:
    """Probe the database without reading user records; cache for 30 seconds.

    Client construction only validates configuration. It cannot detect paused
    projects, DNS failures, expired credentials, or an unavailable database.
    """
    global _probe_until, _probe_ready
    with _probe_lock:
        if time.monotonic() < _probe_until:
            return _probe_ready
        _probe_ready = False
        if config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY:
            try:
                response = httpx.get(
                    config.SUPABASE_URL.rstrip('/') + '/rest/v1/workflows',
                    params={'select': 'workflow_id', 'limit': '0'},
                    headers={'apikey': config.SUPABASE_SERVICE_ROLE_KEY,
                             'Authorization': 'Bearer ' + config.SUPABASE_SERVICE_ROLE_KEY},
                    timeout=3.0,
                    follow_redirects=False,
                )
                _probe_ready = response.status_code == 200 and response.json() == []
            except (httpx.HTTPError, ValueError):
                pass
        _probe_until = time.monotonic() + 30.0
        return _probe_ready


def _require_client():
    client = get_client()
    if client is None:
        raise RuntimeError("Supabase not configured")
    return client


def insert(table: str, rows: list[dict]) -> list[dict]:
    client = _require_client()
    resp = client.table(table).insert(rows).execute()
    return resp.data


def upsert(table: str, rows: list[dict], on_conflict: str) -> list[dict]:
    client = _require_client()
    resp = client.table(table).upsert(rows, on_conflict=on_conflict).execute()
    return resp.data


def update(table: str, match: dict, values: dict) -> dict | None:
    client = _require_client()
    query = client.table(table).update(values)
    for key, value in match.items():
        query = query.eq(key, value)
    resp = query.execute()
    return resp.data[0] if resp.data else None


def select_where(table: str, match: dict = None, order: str = None) -> list[dict]:
    client = _require_client()
    q = client.table(table).select("*")
    for key, value in (match or {}).items():
        q = q.eq(key, value)
    if order:
        q = q.order(order, desc=True)
    resp = q.execute()
    return resp.data


def delete_where(table: str, match: dict) -> None:
    client = _require_client()
    q = client.table(table).delete()
    for key, value in match.items():
        q = q.eq(key, value)
    q.execute()


def select_where_like(table: str, column: str, pattern: str) -> list[dict]:
    """Rows whose ``column`` matches a SQL LIKE pattern.

    Needed for tables keyed by a composite string rather than a user_id column,
    such as ``rate_limit_events`` whose key is ``"<scope>:<uid>"``.
    """
    client = _require_client()
    resp = client.table(table).select("*").like(column, pattern).execute()
    return resp.data


def delete_where_like(table: str, column: str, pattern: str) -> int:
    """Delete rows matching a LIKE pattern. Returns the number removed."""
    client = _require_client()
    removed = (
        client.table(table).delete().like(column, pattern).execute().data or []
    )
    return len(removed)
