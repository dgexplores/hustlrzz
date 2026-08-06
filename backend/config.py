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

    API_KEY = os.getenv("GROQ_API_KEY", "")
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


class PortfolioConfig:
    """Configuration for portfolio analysis service"""

    # Page loading timeout in seconds
    TIMEOUT = 30

    # Maximum content size to extract (characters)
    MAX_CONTENT_SIZE = 50000

    # User agent for web scraping
    USER_AGENT = "Portfolio-Analyzer/1.0"

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
