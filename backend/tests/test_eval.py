"""Eval harness contracts + Learn-mode explainer + spaced drills."""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend.eval.run import check_report, load_fixtures  # noqa: E402


def _good_report():
    return {
        "scores": {
            "communication": 85, "structure": 80, "depth": 82,
            "behavioral_star": 78, "technical_accuracy": 88, "confidence": 80,
        },
        "strengths": ["Quantified the Redis caching win, p95 900ms to 540ms."],
        "improvements": ["Name your personal decisions more explicitly."],
        "delivery_notes": [],
        "star_example": "Redis rollout cut p95 to 540ms.",
        "next_drill": "Retell the story in 90 seconds with only numbers.",
        "summary": "Strong evidence-backed answer.",
        "verdict": "Hire signal on technical depth.",
    }


# --------------------------------------------------------------------------- #
# Fixture schema
# --------------------------------------------------------------------------- #
def test_golden_fixtures_valid():
    fixtures = load_fixtures()
    assert len(fixtures) >= 2
    for fix in fixtures:
        assert fix["id"] and fix["transcript"] and fix["questions"]
        for turn in fix["transcript"]:
            assert turn["from"] in {"candidate", "interviewer"}
            assert turn["text"].strip()
        assert "min_scored_areas" in fix["expect"]


# --------------------------------------------------------------------------- #
# Contract checker
# --------------------------------------------------------------------------- #
def test_check_report_passes_good_report():
    fixtures = {f["id"]: f for f in load_fixtures()}
    assert check_report(_good_report(), fixtures["strong-backend-answer"]) == []


def test_check_report_catches_missing_keys_and_bad_scores():
    fixtures = {f["id"]: f for f in load_fixtures()}
    bad = {"scores": {"communication": 500}, "strengths": [], "improvements": []}
    issues = check_report(bad, fixtures["strong-backend-answer"])
    assert any("missing key" in i for i in issues)
    assert any("out of range" in i for i in issues)
    assert any("empty" in i for i in issues)


def test_check_report_requires_cited_evidence():
    fixtures = {f["id"]: f for f in load_fixtures()}
    report = _good_report()
    report["strengths"] = ["Good answer with nice structure."]
    report["star_example"] = "Did well."
    report["summary"] = "Fine."
    issues = check_report(report, fixtures["strong-backend-answer"])
    assert any("540ms" in i or "Redis" in i for i in issues)


# --------------------------------------------------------------------------- #
# Learn-mode explainer
# --------------------------------------------------------------------------- #
def test_explain_answer_teaches_technique(monkeypatch):
    from backend.career import analysis

    seen = {}

    def fake_strict(system, user):
        seen["system"] = system
        seen["user"] = user
        return {
            "why_it_works": ["STAR structure"],
            "structure": "hook -> evidence -> result",
            "strong_phrases": [{"quote": "p95 fell", "why": "numbers signal rigor"}],
            "upgrades": ["Add your personal decision."],
            "reuse_rule": "Always attach a number to a claim.",
        }

    monkeypatch.setattr(analysis.provider, "chat_json_strict", fake_strict)
    out = analysis.explain_answer("Tell me about scale?", "We cut p95 from 900ms to 540ms with Redis.")
    assert out["reuse_rule"].startswith("Always")
    assert "untrusted" in seen["system"]


def test_explain_answer_eli5_level(monkeypatch):
    from backend.career import analysis

    seen = {}

    def fake_strict(system, user):
        seen["user"] = user
        return {"why_it_works": ["x"], "structure": "s", "strong_phrases": [], "upgrades": [], "reuse_rule": "r"}

    monkeypatch.setattr(analysis.provider, "chat_json_strict", fake_strict)
    analysis.explain_answer("Q is long enough here?", "This answer is definitely long enough to pass validation.", level="eli5")
    assert "15" in seen["user"]


def test_explain_answer_parse_failure():
    from backend.career import analysis

    import backend.ai.provider as provider

    orig = provider.chat_json_strict
    provider.chat_json_strict = lambda s, u: {"unexpected": True}
    try:
        assert "error" in analysis.explain_answer("Tell me about scale?", "We cut p95 from 900ms to 540ms with Redis caching.")
    finally:
        provider.chat_json_strict = orig


# --------------------------------------------------------------------------- #
# Spaced drills
# --------------------------------------------------------------------------- #
def test_due_drills_from_weak_skills(monkeypatch):
    from backend.memory import profile

    rows = [
        {"gap_skills": ["caching", "system design"], "strength_skills": ["python"]},
        {"gap_skills": ["caching"], "strength_skills": []},
    ]
    monkeypatch.setattr(profile.dbc, "is_ready", lambda: True)
    monkeypatch.setattr(profile.dbc, "select_where", lambda table, match=None, order=None: rows if table == "assessment_attempts" else [])
    drills = profile.get_due_drills("u1")
    assert [d["due_in_days"] for d in drills] == [1, 3][: len(drills)]
    assert drills[0]["skill"] == "caching"
    assert "caching" in drills[0]["drill"]["prompt"]
    assert drills[0]["drill"]["scenario"] == "behavioral"


def test_due_drills_empty_without_history(monkeypatch):
    from backend.memory import profile

    monkeypatch.setattr(profile.dbc, "is_ready", lambda: False)
    assert profile.get_due_drills("u1") == []
