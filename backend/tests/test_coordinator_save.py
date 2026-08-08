"""Regression tests for the coordinator's workflow DB-save behavior.

These pin the fix for silent save failures: the coordinator must (a) always
create the workflow row (fallback title when the AI omits one), (b) report
`workflow_persisted=False` when the row could not be saved, and (c) refuse to
report success when nothing was persisted.
"""

import pytest

from backend.coordinator.preparation_workflow import (
    _save_workflow_results_to_database,
    run_preparation_workflow,
)

SAMPLE_SUMMARY = {
    "title": "Fintech, Senior Backend Engineer",
    "resumeInfo": "5 years Python",
    "linkedinInfo": "",
    "githubInfo": "",
    "portfolioInfo": "",
    "additionalInfo": "",
    "jobDescription": "Senior Backend Engineer",
}


class FakeDB:
    """In-memory fake for the three DB methods the coordinator uses."""

    def __init__(self):
        self.created_titles = []

    def create_or_update_workflow(self, user_id, session_id, workflow_data):
        self.created_titles.append(workflow_data.title)
        return {"message": "ok", "data": None}

    def set_personal_experience(self, *a, **k):
        return {"message": "ok", "data": None}

    def set_recommended_qas(self, *a, **k):
        return {"message": "ok", "data": None}


@pytest.mark.asyncio
async def test_save_uses_ai_title_when_present(monkeypatch):
    """A title from the summarizer is persisted as-is."""
    db = FakeDB()
    monkeypatch.setattr("backend.data.database.firestore_db", db)
    result = await _save_workflow_results_to_database(
        "u1", "wf1", {"personal_summary": SAMPLE_SUMMARY, "answers_data": []}
    )
    assert result["workflow_persisted"] is True
    assert result["success"] is True
    assert db.created_titles == ["Fintech, Senior Backend Engineer"]


@pytest.mark.asyncio
async def test_save_falls_back_when_title_missing(monkeypatch):
    """A missing AI title must not prevent the workflow row from persisting."""
    db = FakeDB()
    monkeypatch.setattr("backend.data.database.firestore_db", db)
    summary = dict(SAMPLE_SUMMARY, title="")
    result = await _save_workflow_results_to_database(
        "u1", "wf1", {"personal_summary": summary, "answers_data": []}
    )
    assert result["workflow_persisted"] is True
    assert db.created_titles == ["Interview Preparation"]


@pytest.mark.asyncio
async def test_save_reports_failure_when_row_not_persisted(monkeypatch):
    """A failing workflow write must surface as workflow_persisted=False."""

    class BrokenDB:
        def create_or_update_workflow(self, user_id, session_id, workflow_data):
            raise Exception("foreign key violation")

        def set_personal_experience(self, *a, **k):
            raise Exception("should not be reached")

        def set_recommended_qas(self, *a, **k):
            raise Exception("should not be reached")

    monkeypatch.setattr("backend.data.database.firestore_db", BrokenDB())
    result = await _save_workflow_results_to_database(
        "u1", "wf1", {"personal_summary": SAMPLE_SUMMARY, "answers_data": []}
    )
    assert result["workflow_persisted"] is False
    assert result["success"] is False
    assert any("foreign key" in e.lower() for e in result["errors"])


@pytest.mark.asyncio
async def test_workflow_reports_failure_when_save_fails(monkeypatch):
    """run_preparation_workflow must not report success when nothing persisted."""
    import backend.coordinator.preparation_workflow as pw

    async def fake_save(user_id, session_id, updates):
        return {"success": False, "workflow_persisted": False, "errors": ["boom"]}

    monkeypatch.setattr(pw, "_search_web", lambda *a, **k: [])
    monkeypatch.setattr(pw.groq_provider, "is_configured", lambda: True)
    def fake_chat_json(system, user, model=None, temperature=0.3):
        if "Generate the interview questions" in user:
            return []
        if "Generate the personalized answers" in user:
            return []
        if "raw search results" in user:
            return {"searchQueries": [], "interviewProcess": {}}
        return dict(SAMPLE_SUMMARY)

    monkeypatch.setattr(pw.groq_provider, "chat_json", fake_chat_json)
    monkeypatch.setattr(pw, "_save_workflow_results_to_database", fake_save)

    result = await run_preparation_workflow(
        user_id="u1",
        resume_text="A resume with more than thirty characters of text.",
        job_description="Software Engineer",
    )
    assert result["success"] is False
    assert "could not be saved" in result.get("error", "").lower()
    assert result.get("save_errors") == ["boom"]
