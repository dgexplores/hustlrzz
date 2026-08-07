"""Supabase initialization (service-role client for auth + Postgres).

The server can boot without Supabase configured; in that case ``supabase``
is None and API endpoints report a clear 503 error. During CI, a MagicMock
is used so tests run without credentials.
"""

import os

from supabase import create_client, Client

supabase = None
supabase_ready = False


def _init_supabase():
    global supabase, supabase_ready
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        print(
            "[WARN] Supabase not configured: set SUPABASE_URL and "
            "SUPABASE_SERVICE_ROLE_KEY in backend/.env (see .env.example). "
            "Auth and data endpoints will return 503 until configured."
        )
        return
    supabase = create_client(url, key)
    supabase_ready = True
    print("[SUPABASE] Supabase client initialized successfully.")


if os.getenv("CI") == "true":
    from unittest.mock import MagicMock

    supabase = MagicMock()
    supabase_ready = True
else:
    try:
        _init_supabase()
    except Exception:
        import logging

        logging.getLogger("hustlrzz.supabase").warning(
            "Supabase client initialization failed. Auth/data endpoints "
            "return 503 until SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are "
            "correctly configured.",
            exc_info=True,
        )
        supabase = None
        supabase_ready = False
