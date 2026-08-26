"""Full-stack integration tests: real HTTP layer + WebSocket interview flow.

Providers, DuckDuckGo search and Supabase are replaced with deterministic
fakes; everything else (routing, auth guards, rate limits, Pydantic models,
session registry, ws handshake tokens, grading, intelligence caching) runs for
real through FastAPI's TestClient.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

import json  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app, get_user  # noqa: E402

USER = {"uid": "u-integration", "email": "t@example.com", "name": "T", "picture": ""}


@pytest.fixture()
def client(monkeypatch):
    app.dependency_overrides[get_user] = lambda: USER

    # Fresh rate-limit windows for every test so bursts never leak across cases.
    from backend.obs import limiter as _limiter

    _limiter._events.clear()

    # ---- Fake database -------------------------------------------------- #
    store: dict[str, list[dict]] = {"workflows": [], "assessment_attempts": [], "interview_sessions": []}

    def fake_insert(table, rows):
        for row in rows:
            store.setdefault(table, []).append(dict(row))
        return [dict(r) for r in rows]

    def fake_update(table, match, values):
        target = None
        for row in store.get(table, []):
            if all(row.get(k) == v for k, v in match.items()):
                row.update(values)
                target = row
        return target

    def fake_select(table, match=None, order=None):
        rows = store.get(table, [])
        out = [r for r in rows if all(r.get(k) == v for k, v in (match or {}).items())]
        if order:
            out.sort(key=lambda r: str(r.get(order, "")), reverse=True)
        return [dict(r) for r in out]

    from backend import db as dbc

    monkeypatch.setattr(dbc, "is_ready", lambda: True)
    monkeypatch.setattr(dbc, "insert", fake_insert)
    monkeypatch.setattr(dbc, "update", fake_update)
    monkeypatch.setattr(dbc, "select_where", fake_select)

    # ---- Fake AI provider ----------------------------------------------- #
    from backend.ai import provider as prov

    captured = {"chat": [], "judge": []}
    monkeypatch.setattr(prov, "chat", lambda system, user, temperature=0.4: json.dumps({
        "message": "Solid answer - let us continue.",
        "question": "Next question?",
        "done": False,
    }))
    original_strict = prov.chat_json_strict

    def fake_strict(system, user):
        captured["judge"].append(user)
        if "JUDGE THE FOLLOWING INTERVIEW" in user:
            return {"scores": {"communication": 77}, "summary": "ok", "verdict": "pass-with-practice"}
        if "Required schema" in system or "hiring-process analyst" in system:
            return {"summary": "Acme hires via OA then interviews.", "rounds": [
                {"name": "Online Assessment", "count": 1, "focus": "aptitude", "source_ids": ["S1"]},
            ], "question_patterns": [], "approach_style": "practical", "difficulty_signal": "hard",
                "evaluation_focus": ["depth"], "preparation_tips": ["practice aloud"]}
        if "assessment designer" in system:
            return {"rounds": [
                {"key": "aptitude", "questions": [_mcq(i) for i in range(4)]},
                {"key": "technical", "questions": [_mcq(10 + i, skill="sql") for i in range(2)]},
                {"key": "judgment", "questions": [_mcq(20 + i, skill="ownership") for i in range(2)]},
            ]}
        return {"matched_skills": ["python"], "gap_skills": ["go"], "resume_weaknesses": [],
                "overall_match_percent": 64, "summary": "decent fit"}

    monkeypatch.setattr(prov, "chat_json_strict", fake_strict)

    # ---- Fake preparation workflow + intelligence + RAG ----------------- #
    async def fake_prep(**kwargs):
        return {
            "success": True,
            "workflow_id": "wf-123",
            "session_id": "wf-123",
            "company_match": {"summary": "Backend role", "overall_match_percent": 64},
            "questions": [{"question": "Explain CAP theorem.", "type": "technical"},
                          {"question": "Describe a hard bug you fixed.", "type": "behavioral"}],
            "answers": [],
            "industry_faqs": {},
            "company_research": {"status": "fallback"},
            "completed_agents": [],
            "processing_time": 0.1,
        }

    monkeypatch.setattr("backend.app.run_preparation_workflow", fake_prep)

    async def fake_ensure(company_name, role="", force=False):
        return {"status": "live", "company": company_name, "fetched_at": "2026-08-26T00:00:00Z",
                "confidence": "high",
                "data": {"summary": "s", "rounds": [], "question_patterns": []}}

    import backend.career.intelligence as intel_mod

    monkeypatch.setattr(intel_mod, "ensure_fresh", fake_ensure)
    monkeypatch.setattr("backend.app.rag.is_ready", lambda: False)

    yield TestClient(app), store, captured
    app.dependency_overrides.clear()


def _mcq(seed: int, skill: str = "series") -> dict:
    return {
        "prompt": f"Question {seed}: what comes next in 2,4,6,8?",
        "options": ["9", "10", "11", "12"],
        "answer_index": 1,
        "skill": skill,
        "explanation": "+2 each step.",
    }


# --------------------------------------------------------------------------- #
def test_health(client):
    c, _, _ = client
    res = c.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok" and "version" in body


def test_missing_token_rejected(client):
    c, _, _ = client
    app.dependency_overrides.pop(get_user, None)
    try:
        res = c.get("/workflows")
        assert res.status_code == 401
    finally:
        app.dependency_overrides[get_user] = lambda: USER


def test_rate_limit_blocks_burst(client):
    c, _, _ = client
    statuses = []
    for _ in range(10):  # limit is 8/min for interview starts
        res = c.post("/interviews/start", json={"workflow_id": "missing", "duration": 15})
        statuses.append(res.status_code)
    assert 429 in statuses


def test_workflows_start_end_to_end(client):
    c, store, _ = client
    res = c.post("/workflows/start", data={
        "resume_text": "x" * 200, "job_description": "y" * 200, "company_name": "Acme",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["success"] is True
    assert len(body["questions"]) == 2
    assert body["workflow_id"] == "wf-123"
    assert body["company_intelligence"]["status"] == "live"
    persisted = store["workflows"][0]
    assert persisted["workflow_id"] == "wf-123" and persisted["user_id"] == USER["uid"]


def test_company_intel_endpoint(client):
    c, _, _ = client
    res = c.get("/companies/Acme/intelligence")
    assert res.status_code == 200
    assert res.json()["data"]["status"] == "live"


# --------------------------------------------------------------------------- #
# Assessment battery through the real HTTP layer
# --------------------------------------------------------------------------- #
def test_assessment_full_flow(client):
    c, store, _ = client
    started = c.post("/assessment/start", json={"role": "Data Engineer", "company": "Acme", "level": "mid"})
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    assert data["round_count"] == 3
    first_round = data["round"]
    # Answer keys never leak pre-submission.
    assert "answer_index" not in json.dumps(first_round)
    assert "explanation" not in json.dumps(first_round)

    attempt_id = data["attempt_id"]
    responses_all = {f"q{i+1}": 1 for i in range(4)}
    r1 = c.post(f"/assessment/attempts/{attempt_id}/submit", json={"round_index": 0, "responses": responses_all})
    assert r1.status_code == 200
    payload = r1.json()["data"]
    assert payload["completed"] is False and payload["score"] == 100
    assert payload["next_round"]["key"] == "technical"

    r2 = c.post(f"/assessment/attempts/{attempt_id}/submit",
                json={"round_index": 1, "responses": {"q1": 0, "q2": 1}})
    assert r2.status_code == 200
    assert r2.json()["data"]["score"] == 50
    # Review covers the round just graded; one miss expected here.
    assert any(item["correct"] is False for item in r2.json()["data"]["review"])

    final = c.post(f"/assessment/attempts/{attempt_id}/submit",
                   json={"round_index": 2, "responses": {"q1": 1, "q2": 1}})
    assert final.status_code == 200
    report = final.json()["data"]["report"]
    assert report["total_percent"] == 83  # 100, 50, 100 -> mean 83
    assert report["band"] == "Solid"

    history = c.get("/assessment/attempts").json()["data"]
    assert history and history[0]["total_percent"] == 83

    wrong_owner = c.get(f"/assessment/attempts/nonexistent")
    assert wrong_owner.status_code == 404


# --------------------------------------------------------------------------- #
# THE critical regression: live interview actually loads prepared questions
# --------------------------------------------------------------------------- #
def test_live_interview_uses_prepared_questions(client, monkeypatch):
    c, store, captured = client
    store["workflows"].append({
        "workflow_id": "wf-live", "user_id": USER["uid"], "company": "Acme",
        "title": "Backend Engineer",
        "questions": [{"question": "Explain CAP theorem."},
                      {"question": "Describe a hard bug you fixed."}],
        "match": {},
    })
    started = c.post("/interviews/start", json={"workflow_id": "wf-live", "duration": 15})
    assert started.status_code == 200, started.text
    data = started.json()["data"]
    qs = data["websocket_parameter"]

    from backend.agents import interviewer as iv

    seen_systems = []

    real_chat = iv.provider.chat

    def spy_chat(system, user, temperature=0.4):
        seen_systems.append(system)
        return json.dumps({"message": "Good. Next: describe a hard bug you fixed.",
                           "question": "Describe a hard bug you fixed.", "done": False})

    monkeypatch.setattr(iv.provider, "chat", spy_chat)

    with c.websocket_connect(f"/ws/{data['session_id']}{qs}") as ws:
        opener = ws.receive_json()
        assert opener["type"] == "question"
        # THE FIX VERIFIED: opener comes from the prepared pack, not the default.
        assert "CAP theorem" in opener["data"]["question"]

        ws.send_json({"type": "message", "text": "CAP is about consistency, availability, partition tolerance."})
        reply = ws.receive_json()
        assert reply["type"] == "message"
        assert "hard bug" in reply["data"]["message"]

        ws.send_json({"type": "end", "presence": {"postureScore": 88, "headTiltDeg": 4.0}})
        report_msg = ws.receive_json()
        assert report_msg["type"] == "report"
        assert report_msg["data"]["verdict"] == "pass-with-practice"

    # Interviewer was grounded: prepared question + company context in system.
    assert any("CAP theorem" in s for s in seen_systems)
    assert any("Acme" in s for s in seen_systems)
    assert any("Backend Engineer" in s for s in seen_systems)
    # Judge received the presence snapshot.
    judge_user = next(u for u in captured["judge"] if "JUDGE" in u)
    assert "postureScore" in judge_user and "CAP theorem" in judge_user
    # Session persisted with transcript.
    saved = store["interview_sessions"]
    assert saved and saved[0]["transcript"][0]["text"].startswith("Explain CAP")


def test_websocket_rejects_bad_token(client):
    c, store, _ = client
    store["workflows"].append({
        "workflow_id": "wf-x", "user_id": USER["uid"], "questions": [], "match": {},
    })
    started = c.post("/interviews/start", json={"workflow_id": "wf-x", "duration": 10})
    data = started.json()["data"]
    bad_qs = data["websocket_parameter"].replace("token=", "token=wrongtoken")
    with pytest.raises(Exception):
        with c.websocket_connect(f"/ws/{data['session_id']}{bad_qs}") as ws:
            ws.receive_json()


def test_websocket_rejects_double_connection(client):
    c, store, _ = client
    store["workflows"].append({"workflow_id": "wf-y", "user_id": USER["uid"], "questions": [], "match": {}})
    data = c.post("/interviews/start", json={"workflow_id": "wf-y"}).json()["data"]
    ws_path = f"/ws/{data['session_id']}{data['websocket_parameter']}"
    with c.websocket_connect(ws_path) as first:
        first.receive_json()  # consume opener; connection now marked active
        with pytest.raises(Exception):
            with c.websocket_connect(ws_path) as second:
                second.receive_json(timeout=2)
