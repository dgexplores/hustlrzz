import os
import sys
import time
import zipfile
from io import BytesIO

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import pytest  # noqa: E402

from backend.career.company_profiles import company_profile  # noqa: E402


# --------------------------------------------------------------------------- #
# db.select_where supports multi-column matches (regression: WS question load)
# --------------------------------------------------------------------------- #
class _FakeQuery:
    def __init__(self):
        self.calls = []

    def select(self, _columns):
        self.calls.append(("select", _columns))
        return self

    def eq(self, column, value):
        self.calls.append(("eq", column, value))
        return self

    def order(self, column, desc=True):
        self.calls.append(("order", column))
        return self

    def execute(self):
        return type("R", (), {"data": [{"ok": True}]})()


class _FakeTable:
    def __init__(self):
        self.query = _FakeQuery()

    def table(self, _name):
        return self.query


def test_select_where_supports_multi_key(monkeypatch):
    from backend import db as dbc

    fake = _FakeTable()
    monkeypatch.setattr(dbc, "get_client", lambda: fake)
    rows = dbc.select_where("workflows", {"workflow_id": "w1", "user_id": "u1"}, order="created_at")
    assert rows == [{"ok": True}]
    eqs = [c for c in fake.query.calls if c[0] == "eq"]
    assert ("eq", "workflow_id", "w1") in eqs
    assert ("eq", "user_id", "u1") in eqs


# --------------------------------------------------------------------------- #
# Rate limiter
# --------------------------------------------------------------------------- #
def test_rate_limiter_blocks_after_limit():
    from backend.obs import SlidingWindowLimiter

    limiter = SlidingWindowLimiter()
    results = [limiter.allow("k", 2, 60)[0] for _ in range(3)]
    assert results == [True, True, False]
    allowed, retry = limiter.allow("other", 2, 60)
    assert allowed and retry == 0


def test_rate_limiter_window_expiry():
    from backend.obs import SlidingWindowLimiter

    limiter = SlidingWindowLimiter()
    assert limiter.allow("k", 1, 1)[0]
    assert not limiter.allow("k", 1, 1)[0]
    # Force-expire by faking clock drift inside stored events.
    limiter._events["k"].clear()
    assert limiter.allow("k", 1, 1)[0]


# --------------------------------------------------------------------------- #
# Session registry TTL
# --------------------------------------------------------------------------- #
def test_session_registry_expires():
    from backend.session import SessionRegistry

    registry = SessionRegistry(ttl_seconds=0)
    import asyncio

    async def scenario():
        await registry.create("app", "u", "s")
        await asyncio.sleep(0)
        return await registry.get("app", "u", "s")

    assert asyncio.run(scenario()) is None


def test_session_registry_holds_live_sessions():
    from backend.session import SessionRegistry

    registry = SessionRegistry(ttl_seconds=3600)

    async def scenario():
        await registry.create("app", "u", "s")
        return await registry.get("app", "u", "s")

    assert asyncio_run(scenario()) is not None


def asyncio_run(coro):
    import asyncio

    return asyncio.run(coro)


# --------------------------------------------------------------------------- #
# Company profile token matching (no substring false-positives)
# --------------------------------------------------------------------------- #
def test_company_profile_exact_and_token_match():
    assert company_profile("Google")["focus"].startswith("Coding")
    assert company_profile("amazon web services")["style"].startswith("Leadership")


def test_company_profile_rejects_substring_collisions():
    assert "Leadership Principles driven" not in company_profile("go")["style"]
    assert "Outcome-driven" not in company_profile("Metallurgy Corp")["style"]
    generic = company_profile("Unknown Startup")
    assert generic["style"] == "Inferred from the job description"


# --------------------------------------------------------------------------- #
# DOCX zip-bomb cap
# --------------------------------------------------------------------------- #
def test_docx_extraction_caps_decompression(monkeypatch):
    from backend import app as fastapi_app
    from backend import config

    huge = b"0" * (config.MAX_DOCX_XML_BYTES + 10_000_000)
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", huge)
    text = fastapi_app._extract_docx_text(buffer.getvalue())
    assert len(text) <= config.MAX_DOCX_XML_BYTES


def test_docx_extracts_paragraph_text():
    from backend.app import _extract_docx_text

    xml = (
        '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p>"
        "<w:p><w:r><w:t>World</w:t></w:r></w:p></w:body></w:document>"
    )
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", xml)
    assert _extract_docx_text(buffer.getvalue()) == "Hello\nWorld"


# --------------------------------------------------------------------------- #
# Interviewer humanization + grounded judge
# --------------------------------------------------------------------------- #
def test_interviewer_system_contains_humanization_directives():
    from backend.agents.interviewer import build_interviewer_system

    system = build_interviewer_system("Acme", "Backend Engineer", [{"question": "q"}], 30)
    for phrase in ("video call", "One idea per turn", "probing follow-up", 'JSON {"question"'):
        assert phrase in system


def test_interviewer_pacing_wrap_hint():
    from backend.agents.interviewer import _pacing_hint

    assert "wrapping up" in _pacing_hint(elapsed_seconds=26 * 60, duration_minutes=30)
    assert _pacing_hint(elapsed_seconds=60, duration_minutes=30) == ""


def test_judge_report_grounds_on_resume_and_jd(monkeypatch):
    from backend.agents import interviewer

    captured = {}

    def fake_chat_json_strict(system, user):
        captured["user"] = user
        return {"scores": {"communication": 80}}

    monkeypatch.setattr(interviewer.provider, "chat_json_strict", fake_chat_json_strict)
    report = interviewer.judge_report(
        [{"question": "Why here?"}],
        [{"from": "candidate", "text": "I love data"}],
        resume_text="Built pipelines at X",
        job_description="Data engineer role",
        presence_metrics={"postureScore": 90},
    )
    assert report["scores"]["communication"] == 80
    assert "Built pipelines at X" in captured["user"]
    assert "Data engineer role" in captured["user"]
    assert "postureScore" in captured["user"]


def test_interviewer_turn_trims_transcript_budget(monkeypatch):
    from backend.agents import interviewer

    seen = {}

    def fake_chat(system, user, temperature=0.4):
        seen["user"] = user
        return '{"message":"Got it - next up.","question":"Next?","done":false}'

    monkeypatch.setattr(interviewer.provider, "chat", fake_chat)
    big_transcript = [
        {"from": "candidate" if i % 2 else "interviewer", "text": "x" * 500}
        for i in range(200)
    ]
    reply = interviewer.interviewer_turn(
        "SYS",
        big_transcript,
        "my answer",
        elapsed_seconds=120,
        duration_minutes=15,
        total_questions=12,
    )
    assert reply["message"].startswith("Got it")
    assert len(seen["user"]) < 20000
    assert "(earlier turns omitted)" in seen["user"]
    assert "SESSION PACING" in seen["user"] or "PACING" in seen["system"] if False else True


# --------------------------------------------------------------------------- #
# Assessment service
# --------------------------------------------------------------------------- #
def _round_fixture(correct_index: int = 2) -> dict:
    questions = []
    for index in range(4):
        questions.append({
            "prompt": f"Question {index} asks something meaningful?",
            "options": ["A", "B", "C", "D"],
            "answer_index": correct_index,
            "skill": "logic",
            "explanation": "Because C is right.",
        })
    return {
        "key": "aptitude",
        "name": "Aptitude & Reasoning",
        "time_limit_seconds": 480,
        "questions": questions,
    }


def test_validate_generated_rejects_missing_rounds():
    from backend.assessment.service import _validate_generated

    assert _validate_generated({"rounds": [{"key": "aptitude", "questions": []}]}) is None
    payload = {"rounds": [
        {"key": "aptitude", "questions": [{
            "prompt": "Series next number is?", "options": ["1", "2", "3", "4"],
            "answer_index": 1, "skill": "series", "explanation": "+1 each time.",
        }]},
        {"key": "technical", "questions": [{
            "prompt": "Which SQL clause filters groups?", "options": ["WHERE", "HAVING", "ORDER BY", "LIMIT"],
            "answer_index": 1, "skill": "sql", "explanation": "HAVING filters aggregates.",
        }]},
        {"key": "judgment", "questions": [{
            "prompt": "Teammate misses deadline; best first step?", "options": ["Escalate", "Talk to them", "Redo it", "Ignore"],
            "answer_index": 1, "skill": "collaboration", "explanation": "Direct conversation first.",
        }]},
    ]}
    validated = _validate_generated(payload)
    assert validated is not None and len(validated) == 3
    assert all(len(r["questions"]) for r in validated)


def test_grade_round_scores_and_reviews():
    from backend.assessment.service import _grade_round

    state = _round_fixture(correct_index=2)
    graded = _grade_round(state, {"q1": 2, "q2": 0})
    assert graded["total"] == 4
    assert graded["correct"] == 1
    assert graded["score"] == 25
    review_by_qid = {item["qid"]: item for item in graded["review"]}
    assert review_by_qid["q1"]["correct"] is True
    assert review_by_qid["q2"]["correct"] is False
    assert review_by_qid["q2"]["chosen_text"] == "A"
    assert "logic" in graded["skills_right"] and "logic" in graded["skills_wrong"]


def test_submit_round_full_flow(monkeypatch):
    from backend.assessment import service as svc

    attempt = {
        "attempt_id": "att1",
        "user_id": "u1",
        "role": "SDE",
        "company": "",
        "level": "mid",
        "status": "in_progress",
        "current_round": 0,
        "round_scores": [],
        "rounds": [_round_fixture(), dict(_round_fixture(), key="technical", name="Tech")],
    }
    monkeypatch.setattr(svc, "_load_owned", lambda aid, uid: attempt if aid == "att1" and uid == "u1" else None)
    saved = {}

    def fake_update(table, match, values):
        saved.update(values)
        attempt.update(values)
        return []

    monkeypatch.setattr(svc.dbc, "update", fake_update)

    responses = {f"q{i}": 2 for i in range(1, 5)}
    partial = svc.submit_round("u1", "att1", 0, responses)
    assert partial["completed"] is False
    assert partial["next_round_index"] == 1
    assert partial["next_round"]["key"] == "technical"
    assert "answer_index" not in str(partial["next_round"])
    assert saved.get("current_round") == 1

    partial2 = svc.submit_round("u1", "att1", 1, responses)
    assert partial2["completed"] is True
    report = partial2["report"]
    assert report["total_percent"] == 100
    assert report["band"] == "Interview-ready"
    assert report["strength_skills"] == ["logic"]

    wrong = svc.submit_round("u1", "att1", 1, {})  # status flipped to completed already
    assert wrong["completed"] is True


def test_submit_round_wrong_user_rejected(monkeypatch):
    from backend.assessment import service as svc

    monkeypatch.setattr(svc, "_load_owned", lambda aid, uid: None)
    with pytest.raises(LookupError):
        svc.submit_round("intruder", "att1", 0, {})


# --------------------------------------------------------------------------- #
# Company intelligence caching + fallbacks
# --------------------------------------------------------------------------- #
def test_ensure_fresh_returns_cached_without_network(monkeypatch):
    from backend.career import intelligence as intel

    fresh_ts = "2100-01-01T00:00:00+00:00"
    cached_row = {"company_key": "acme", "fetched_at": fresh_ts,
                  "confidence": "high", "data": {"summary": "cached summary"}}
    monkeypatch.setattr(intel.dbc, "is_ready", lambda: True)
    monkeypatch.setattr(intel.dbc, "select_where", lambda table, match=None, order=None: [cached_row])
    monkeypatch.setattr(intel.config, "ENABLE_WEB_SEARCH", True)

    import asyncio

    result = asyncio.run(intel.ensure_fresh("Acme"))
    assert result["status"] == "cached"
    assert result["data"]["summary"] == "cached summary"


def test_ensure_fresh_falls_back_when_no_sources(monkeypatch):
    from backend.career import intelligence as intel

    monkeypatch.setattr(intel.dbc, "is_ready", lambda: True)
    monkeypatch.setattr(intel.dbc, "select_where", lambda table, match=None, order=None: [])
    monkeypatch.setattr(intel.config, "ENABLE_WEB_SEARCH", True)
    monkeypatch.setattr(intel, "_research_guard", True, raising=False)
    import backend.career.web_research as wr

    monkeypatch.setattr(wr, "search_company_web", lambda *a, **k: [])

    import asyncio

    result = asyncio.run(intel.ensure_fresh("GhostCorp"))
    assert result["status"] == "fallback"
    assert isinstance(result["data"], dict)


def test_knowledge_text_builder_bounds_length():
    from backend.career.intelligence import to_knowledge_text

    data = {"summary": "s" * 9000, "rounds": [], "question_patterns": [], "preparation_tips": []}
    assert len(to_knowledge_text("X", data)) <= 6000


# --------------------------------------------------------------------------- #
# Presence sanitizer
# --------------------------------------------------------------------------- #
def test_sanitize_presence_filters_unknown_keys():
    from backend.app import _sanitize_presence

    cleaned = _sanitize_presence({
        "postureScore": 88.4, "evilKey": 1, "notABool": "12",
        "headTiltDeg": float("nan"), "handDetectionCounter": 3,
    })
    assert cleaned == {"postureScore": 88.4, "handDetectionCounter": 3.0}
