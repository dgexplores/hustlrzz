"""Firebase initialization (auth + Firestore).

The server can boot without Firebase configured; in that case ``auth`` and
``db`` are None and API endpoints report a clear 503 error. During CI, a
MagicMock is used so tests run without credentials.
"""

import os

import firebase_admin
from firebase_admin import auth, credentials, firestore  # noqa: F401 (auth is re-exported for routes)

from backend.tools.sercret_manage import load_firebase_key

db = None
firebase_ready = False


def _init_firebase():
    global db, firebase_ready
    if firebase_admin._apps:
        firebase_ready = True
        db = firestore.client()
        return
    firebase_creds = load_firebase_key()
    cred = credentials.Certificate(firebase_creds)
    firebase_admin.initialize_app(cred)
    firebase_ready = True
    db = firestore.client()


if os.getenv("CI") == "true":
    from unittest.mock import MagicMock

    db = MagicMock()
    firebase_ready = True
else:
    try:
        _init_firebase()
        print("[FIREBASE] Firebase initialized successfully.")
    except Exception as exc:
        print(
            f"[WARN] Firebase not initialized ({exc}). "
            "Auth and data endpoints will return 503 until FIREBASE_KEY_PATH is set. "
            "See backend/.env.example."
        )
        db = None
        firebase_ready = False
