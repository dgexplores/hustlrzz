"""Readiness must detect a configured but unreachable Supabase project."""
import httpx
import pytest
from fastapi.testclient import TestClient
from backend import db
from backend.app import app


@pytest.fixture(autouse=True)
def reset_probe(monkeypatch):
    monkeypatch.setattr(db, '_probe_until', 0.0)
    monkeypatch.setattr(db, '_probe_ready', False)
    monkeypatch.setattr(db.config, 'SUPABASE_URL', 'https://fictional.supabase.co')
    monkeypatch.setattr(db.config, 'SUPABASE_SERVICE_ROLE_KEY', 'fictional-test-key')


def test_paused_project_is_not_ready_and_does_not_leak_errors(monkeypatch):
    def unreachable(*args, **kwargs):
        raise httpx.ConnectError('DNS unavailable; private diagnostic')
    monkeypatch.setattr(db.httpx, 'get', unreachable)
    response = TestClient(app).get('/ready')
    assert response.status_code == 503
    assert response.json() == {'status': 'unavailable', 'db_ready': False}
    assert 'private diagnostic' not in response.text


@pytest.mark.parametrize('status,payload', [(401, {'message': 'expired key'}), (200, {'error': 'unexpected response'})])
def test_invalid_dependency_response_is_unavailable(monkeypatch, status, payload):
    monkeypatch.setattr(db.httpx, 'get', lambda *a, **k: httpx.Response(status, json=payload))
    assert TestClient(app).get('/ready').status_code == 503


def test_ready_probe_reads_no_records_and_caches(monkeypatch):
    calls = []
    def healthy(url, **kwargs):
        calls.append(kwargs)
        return httpx.Response(200, json=[])
    monkeypatch.setattr(db.httpx, 'get', healthy)
    client = TestClient(app)
    assert client.get('/ready').json() == {'status': 'ready', 'db_ready': True}
    assert client.get('/ready').status_code == 200
    assert len(calls) == 1
    assert calls[0]['params']['limit'] == '0'
    assert calls[0]['timeout'] == 3.0


def test_liveness_does_not_claim_a_database_probe(monkeypatch):
    monkeypatch.setattr(db, 'is_ready', lambda: True)
    response = TestClient(app).get('/health')
    assert response.status_code == 200
    assert response.json()['db_configured'] is True
    assert response.json()['db_ready'] is None
