"""
Backend configuration management.

All settings are read from environment variables, with a backend/.env file
loaded automatically at import time (see backend/.env.example).
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env as early as possible so os.getenv below sees it.
load_dotenv(Path(__file__).parent / ".env")


def set_google_cloud_env_vars():
    """Backwards-compatible helper: reload env vars from backend/.env."""
    load_dotenv(Path(__file__).parent / ".env")


class GroqConfig:
    """Groq (free LLM) configuration — see https://console.groq.com/keys."""

    # Primary key (backwards compatible).
    API_KEY = os.getenv("GROQ_API_KEY", "")
    # Backup keys: comma-separated GROQ_API_KEYS="key1,key2,key3".
    # The provider rotates to the next key when the current one is
    # rate-limited (HTTP 429), so a busy day on one free key doesn't
    # take the app down. The primary API_KEY is always tried first.
    API_KEYS = [k.strip() for k in os.getenv("GROQ_API_KEYS", "").split(",") if k.strip()]
    if API_KEY and API_KEY not in API_KEYS:
        API_KEYS.insert(0, API_KEY)
    elif not API_KEYS and API_KEY:
        API_KEYS = [API_KEY]

    BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")
    TRANSCRIPTION_MODEL = os.getenv("GROQ_TRANSCRIPTION_MODEL", "whisper-large-v3-turbo")
    TTS_MODEL = os.getenv("GROQ_TTS_MODEL", "canopylabs/orpheus-v1-english")
    TTS_VOICE = os.getenv("GROQ_TTS_VOICE", "tara")
    MAX_RETRIES = int(os.getenv("GROQ_MAX_RETRIES", "3"))


class PDFConfig:
    """
    PDF processing configuration settings
    """
    # File size limits
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

    # Supported file extensions
    ALLOWED_EXTENSIONS = {'.pdf'}

    # Text quality thresholds
    MIN_TEXT_LENGTH = 30  # minimum characters for valid text
    MIN_TEXT_QUALITY_CHARS = 50  # minimum characters for quality analysis
    MIN_TEXT_QUALITY_WORDS = 5   # minimum words for quality analysis

    # PDF processing limits
    MAX_PAGE_COUNT = 50  # maximum pages to process


class RateLimitConfig:
    """Simple in-memory rate limiting (see backend/api/middleware.py)."""

    # Set RATE_LIMIT_ENABLED=false to disable (not recommended)
    ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false"

    # Max requests per minute per client IP for normal endpoints
    DEFAULT_PER_MINUTE = int(os.getenv("RATE_LIMIT_DEFAULT_PER_MINUTE", "300"))

    # Max requests per minute per client IP for expensive AI endpoints
    HEAVY_PER_MINUTE = int(os.getenv("RATE_LIMIT_HEAVY_PER_MINUTE", "30"))

    # Path prefixes that consume significant compute/tokens
    HEAVY_PATHS = ("/workflows", "/interviews")


class PortfolioConfig:
    """Configuration for portfolio analysis service"""

    # Page loading timeout in seconds
    TIMEOUT = 30

    # Maximum content size to extract (characters)
    MAX_CONTENT_SIZE = 50000

    # Backwards-compatible single user agent (rarely used)
    USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

    # Rotating user agents so portfolio sites don't fingerprint/block us
    USER_AGENTS = [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    ]

    def random_user_agent(self) -> str:
        """Pick a random user agent for a scrape request."""
        import random

        return random.choice(self.USER_AGENTS)

    # Maximum number of projects to extract
    MAX_PROJECTS = 20

    # Maximum number of skills to extract
    MAX_SKILLS = 50

    # Common portfolio platforms and their selectors
    PLATFORM_SELECTORS = {
        "default": {
            "projects": ["[class*='project']", "[class*='portfolio']", "[class*='work']"],
            "skills": ["[class*='skill']", "[class*='tech']", "[class*='tool']"],
            "description": ["[class*='bio']", "[class*='about']", "[class*='description']"],
            "title": ["h1", "[class*='name']", "[class*='title']"]
        }
    }


def _cors_origin_list() -> list:
    """Comma-separated CORS_ORIGINS env var, with localhost dev defaults."""
    raw = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://localhost:8080,http://localhost:5000,http://localhost",
    )
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


CORS_ORIGINS = _cors_origin_list()
