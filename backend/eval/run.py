"""Golden-fixture judge checks. See package docstring for offline vs live use."""

from __future__ import annotations

import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("scores", "strengths", "improvements", "summary", "verdict")
SCORE_AREAS = ("communication", "structure", "depth", "behavioral_star", "technical_accuracy", "confidence")

GOLDEN_PATH = Path(__file__).resolve().parent / "golden.json"


def load_fixtures() -> list[dict]:
    return json.loads(GOLDEN_PATH.read_text())


def check_report(report: dict, fixture: dict) -> list[str]:
    """Return a list of contract violations (empty = pass)."""
    issues: list[str] = []
    if not isinstance(report, dict):
        return ["report is not a dict"]
    for key in REQUIRED_KEYS:
        if key not in report:
            issues.append(f"missing key: {key}")
    scores = report.get("scores") or {}
    if not isinstance(scores, dict):
        issues.append("scores is not a dict")
        return issues
    expect = fixture.get("expect", {}) if isinstance(fixture, dict) else {}
    covered = [area for area in SCORE_AREAS if isinstance(scores.get(area), (int, float))]
    if len(covered) < int(expect.get("min_scored_areas", 4)):
        issues.append(f"only {len(covered)} score areas covered")
    for area in covered:
        value = scores[area]
        if not 1 <= value <= 100:
            issues.append(f"score out of range: {area}={value}")
    blob = json.dumps(report).lower()
    for phrase in expect.get("must_mention", []) or []:
        if str(phrase).lower() not in blob:
            issues.append(f"report never mentions evidence: {phrase}")
    for key in ("strengths", "improvements"):
        items = report.get(key)
        if not isinstance(items, list) or not items:
            issues.append(f"{key} is empty")
    return issues


def main() -> int:
    from backend import config
    from backend.ai import provider
    from backend.agents.interviewer import judge_report

    if not provider.is_configured():
        print("No provider key configured (GROQ_API_KEY/GEMINI_API_KEY). Offline only.")
        print(f"Run the contract suite instead: pytest backend/tests/test_eval.py (provider={config.AI_PROVIDER})")
        return 2
    failures = 0
    for fixture in load_fixtures():
        try:
            report = judge_report(
                fixture.get("questions", []),
                fixture.get("transcript", []),
                fixture.get("resume", ""),
                fixture.get("jd", ""),
            )
        except Exception as exc:
            print(f"[{fixture['id']}] judge call failed: {exc}")
            failures += 1
            continue
        issues = check_report(report, fixture)
        status = "PASS" if not issues else f"FAIL: {issues}"
        print(f"[{fixture['id']}] {status}")
        failures += bool(issues)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
