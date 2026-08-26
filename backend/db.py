"""Supabase persistence layer (Postgres, Row-Level Security).

Server-side access uses the service-role key. Tables mirror supabase/schema.sql.
"""

from __future__ import annotations

from supabase import create_client
from supabase.lib.client_options import ClientOptions

from backend import config

_client = None
_ready = False


def get_client():
    global _client, _ready
    if _client is None:
        if not (config.SUPABASE_URL and config.SUPABASE_SERVICE_ROLE_KEY):
            _ready = False
            return None
        _client = create_client(
            config.SUPABASE_URL,
            config.SUPABASE_SERVICE_ROLE_KEY,
            options=ClientOptions(postgrest_client_timeout=30),
        )
        _ready = True
    return _client


def is_ready() -> bool:
    get_client()
    return _ready


def insert(table: str, rows: list[dict]) -> list[dict]:
    client = get_client()
    resp = client.table(table).insert(rows).execute()
    return resp.data


def upsert(table: str, rows: list[dict], on_conflict: str) -> list[dict]:
    client = get_client()
    resp = client.table(table).upsert(rows, on_conflict=on_conflict).execute()
    return resp.data


def update(table: str, match: dict, values: dict) -> dict | None:
    client = get_client()
    query = client.table(table).update(values)
    for key, value in match.items():
        query = query.eq(key, value)
    resp = query.execute()
    return resp.data[0] if resp.data else None


def select_where(table: str, match: dict = None, order: str = None) -> list[dict]:
    client = get_client()
    q = client.table(table).select("*")
    for key, value in (match or {}).items():
        q = q.eq(key, value)
    if order:
        q = q.order(order, desc=True)
    resp = q.execute()
    return resp.data


def delete_where(table: str, match: dict) -> None:
    client = get_client()
    q = client.table(table).delete()
    for key, value in match.items():
        q = q.eq(key, value)
    q.execute()
