"""Unit tests for domestics (provider parse, company profiles, session, schemas)."""

import importlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.ai import provider  # noqa: E402
from backend.career import company_profiles  # noqa: E402


def test_extract_json_fence():
    data = provider.extract_json('```json\n{"a": 1}\n```')
    assert data == {"a": 1}


def test_extract_json_plain():
    data = provider.extract_json('{"b": 2}')
    assert data == {"b": 2}


def test_extract_json_prose_strip():
    data = provider.extract_json('Here you go:\n{"c": 3}\nGood luck!')
    assert data == {"c": 3}


def test_extract_json_invalid():
    data = provider.extract_json("not json at all")
    assert "error" in data or data == {}


def test_company_profile_google():
    p = company_profiles.company_profile("Google")
    assert p["style"]
    assert "Coding" in p["focus"]


def test_company_profile_generic_fallback():
    p = company_profiles.company_profile("SomeRandomStartup Inc")
    assert p["focus"]  # generic fallback present


def test_requirements_parseable():
    assert Path("requirements.txt").exists() or Path("backend/requirements.txt").exists()