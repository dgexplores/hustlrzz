"""Regression tests for the security hardening in backend/api/routes.py."""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from starlette.websockets import WebSocketDisconnect

from backend.app import app
from backend.api.routes import verify_token


def override_verify_token():
    return {
        "uid": "user123",
        "email": "user@example.com",
        "name": "Test User",
        "picture": "http://photo.url",
    }


app.dependency_overrides[verify_token] = override_verify_token
client = TestClient(app)

VALID_RESUME = "A valid resume with enough characters to pass the minimum length check"


def test_start_interview_rejects_unknown_workflow():
    """POST /interviews/start must reject workflows the user does not own."""
    with patch("backend.data.database.firestore_db.get_workflow", return_value={"data": None}):
        response = client.post(
            "/interviews/start",
            json={"workflow_id": "wf_not_owned", "duration": 5, "is_audio": False},
            headers={"Authorization": "Bearer test-token"},
        )
    assert response.status_code == 404


def test_workflow_rejects_invalid_social_url():
    """Malformed social links must be rejected before hitting the AI pipeline."""
    response = client.post(
        "/workflows/start-with-text",
        data={
            "resume_text": VALID_RESUME,
            "job_description": "Software Engineer",
            "linkedin_link": "not a url",
        },
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


def test_workflow_rejects_huge_question_count():
    """Absurd question counts (cost abuse) must be rejected."""
    response = client.post(
        "/workflows/start-with-text",
        data={
            "resume_text": VALID_RESUME,
            "job_description": "Software Engineer",
            "num_questions": "99999",
        },
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


def test_workflow_rejects_ssrf_url():
    """Internal/private hosts must be rejected (SSRF guard)."""
    response = client.post(
        "/workflows/start-with-text",
        data={
            "resume_text": VALID_RESUME,
            "job_description": "Software Engineer",
            "portfolio_link": "http://169.254.169.254/latest/meta-data/",
        },
        headers={"Authorization": "Bearer test-token"},
    )
    assert response.status_code == 422


def test_request_id_echoed():
    """The X-Request-ID header must be echoed on responses."""
    response = client.get("/", headers={"X-Request-ID": "abc123"})
    assert response.headers.get("x-request-id") == "abc123"


def test_websocket_rejects_unbound_session():
    """Connecting to a session that was not started by the user must be rejected."""
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect(
            "/ws/sess_not_bound?user_id=user123&workflow_id=wf1&duration=5&is_audio=false"
        ):
            pass
