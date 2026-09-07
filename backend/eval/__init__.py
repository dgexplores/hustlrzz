"""Offline judge-eval harness: golden fixtures + report contract checks.

Offline (CI): `pytest backend/tests/test_eval.py` validates fixture schema and
the contract checker against canned reports. No API keys needed.

Live (manual): `python -m backend.eval.run` runs judge_report on each fixture
with the configured provider and prints a scored summary. Needs GROQ_API_KEY
and/or GEMINI_API_KEY in backend/.env. Never gate deploys on live scores —
models drift; use the output to spot judge regressions before a demo.
"""
