"""The condensed candidate summary must not replace the target requirements."""
import asyncio
import pytest
from backend.workflow import preparation
from backend.memory import profile


@pytest.mark.parametrize('question_count', [1, 2])
def test_job_description_reaches_question_and_topup_calls(monkeypatch, question_count):
    job_description = 'Build Python APIs with tenant isolation and evaluate retrieval recall on held-out questions.'
    prompts = []

    def strict(system, user):
        if system == preparation.QUESTION_SYSTEM:
            prompts.append(user)
            assert job_description in user
            question = {'question': 'How would you enforce tenant isolation?', 'type': 'technical'}
            return {'questions': [question], 'match': {'overall_match_percent': 75, 'summary': 'Relevant Python evidence.'}}
        return [{'question': 'How would you enforce tenant isolation?', 'answer': 'Scope every query to the authenticated tenant.'}]

    # An entirely legitimate candidate summary omits the target JD. Both the
    # initial question call and a short-pack top-up still need the actual JD.
    monkeypatch.setattr(preparation.provider, 'chat_json', lambda *a, **k: {'skills': ['Python']})
    monkeypatch.setattr(preparation.provider, 'chat_json_strict', strict)
    monkeypatch.setattr(preparation.provider, 'is_configured', lambda: True)
    monkeypatch.setattr(preparation.config, 'ENABLE_WEB_SEARCH', False)
    monkeypatch.setattr(profile, 'get_weakness_context', lambda *a: '')
    result = asyncio.run(preparation.run_preparation_workflow(
        user_id='fictional-test', resume_text='Built a Python API.',
        job_description=job_description, num_questions=question_count))
    assert result['success']
    assert len(result['questions']) == question_count
    assert len(prompts) == question_count
