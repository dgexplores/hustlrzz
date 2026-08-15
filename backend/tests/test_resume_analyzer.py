import asyncio

from backend.resume import service


def test_request_hash_changes_with_job_description():
    assert service.request_hash("Built APIs", "Python") != service.request_hash("Built APIs", "Go")


def test_resume_analysis_is_cached_before_quota_consumption(monkeypatch):
    cached = {"analysis_id": "saved", "resume_score": 82}
    monkeypatch.setattr(service, "_existing", lambda *_: cached)
    monkeypatch.setattr(service, "_consume", lambda *_: (_ for _ in ()).throw(AssertionError("quota should not run")))
    record, from_cache = asyncio.run(service.analyze(user_id="user-a", resume_text="x" * 150))
    assert record == cached
    assert from_cache is True
