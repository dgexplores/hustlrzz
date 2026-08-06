"""Firebase service-account key loading.

Preference order:
  1. FIREBASE_KEY_PATH   -> local JSON file (recommended for dev/deploy)
  2. Secret Manager      -> only when GOOGLE_CLOUD_PROJECT is set and Secret
                            Manager is available
"""

import json
import os
from pathlib import Path

from dotenv import load_dotenv

# Load .env from the backend directory
project_root = Path(__file__).resolve().parent.parent
load_dotenv(dotenv_path=project_root / ".env")

GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
FIREBASE_KEY_PATH = os.getenv("FIREBASE_KEY_PATH", "")


def load_firebase_key():
    """Return the Firebase service-account JSON as a dict."""
    if FIREBASE_KEY_PATH:
        key_path = Path(FIREBASE_KEY_PATH)
        if not key_path.is_absolute():
            key_path = project_root / FIREBASE_KEY_PATH
        if not key_path.exists():
            raise FileNotFoundError(f"Firebase key file not found at {key_path}")
        with open(key_path, "r") as f:
            return json.load(f)

    if GOOGLE_CLOUD_PROJECT:
        try:
            from google.cloud import secretmanager

            client = secretmanager.SecretManagerServiceClient()
            name = f"projects/{GOOGLE_CLOUD_PROJECT}/secrets/FIREBASE_KEY_JSON/versions/latest"
            response = client.access_secret_version(request={"name": name})
            return json.loads(response.payload.data.decode("utf-8"))
        except Exception as exc:
            raise Exception(f"Failed to load Firebase key from Secret Manager: {str(exc)}")

    raise EnvironmentError(
        "Firebase not configured. Set FIREBASE_KEY_PATH to your service-account JSON "
        "(or GOOGLE_CLOUD_PROJECT for Secret Manager) in backend/.env. "
        "See backend/.env.example."
    )
