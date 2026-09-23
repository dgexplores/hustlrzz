# EvidenceQA — Command Outputs (rate-limit fix validation)

Run: 2026-09-23, repo `/Users/dgsmacbook/hustlrzz`, all commands exit 0.

## pytest (backend)

```
backend/.venv/bin/python -m pytest backend/tests/ -q
```

Tail:

```
...........................................                              [100%]
=============================== warnings summary ===============================
... DeprecationWarnings (fastapi/testclient httpx, starlette, gotrue, pytest-asyncio) ...
-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
187 passed, 4 warnings in 47.54s
```

Exit code: **0**. Final count: **187 passed**.

## npm test (vitest)

```
npm test   # → vitest run
```

```
 RUN  v3.2.7 /Users/dgsmacbook/hustlrzz/frontend

 ✓ lib/__tests__/reportMarkdown.test.ts (17 tests) 8ms
 ✓ lib/__tests__/download.test.ts (3 tests) 52ms
 ✓ lib/__tests__/settings.test.ts (7 tests) 8ms
 ✓ lib/__tests__/api.test.ts (11 tests) 12ms
 ✓ lib/__tests__/sessionDetail.test.ts (7 tests) 5ms
 ✓ lib/__tests__/analytics.test.ts (5 tests) 16ms
 ✓ lib/supabase/__tests__/client.test.ts (7 tests) 109ms
 ✓ components/ui/__tests__/button.test.tsx (2 tests) 224ms
 ✓ components/auth/__tests__/AuthGate.test.tsx (3 tests) 128ms

 Test Files  9 passed (9)
      Tests  62 passed (62)
   Duration  1.70s
```

Exit code: **0**. Final count: **62 passed / 9 files**.

## tsc

```
npx tsc --noEmit
```

Output: _(empty)_
Exit code: **0**.

## lint

```
npm run lint   # → eslint .
```

Output: _(empty after banner)_
Exit code: **0**.

## build

```
npm run build
```

Summary:

```
✓ Compiled successfully in 528ms
  Running TypeScript ...
  Finished TypeScript in 1097ms ...
✓ Generating static pages for app (17/17) in 200ms
```

Route table (17 routes incl. `/dashboard/session/[id]` dynamic, `/knowledge`, `/settings`, `/legal/privacy`).
Exit code: **0**.

## Rate-limit fix spot-checks (source)

| Check | Location | Result |
|---|---|---|
| `POST /memory/drills/{skill}/review` uses `rate_limited` | `backend/app.py:1124-1128` | `rate_limited("drill_review", RATE_DRILL_REVIEW_PER_MIN, 60)` |
| `DELETE /workflows/{id}` uses `rate_limited` | `backend/app.py:166-169` | `rate_limited("delete", RATE_DELETE_PER_MIN, 60)` |
| `DELETE /interviews/{id}` uses `rate_limited` | `backend/app.py:201-204` | `rate_limited("delete", RATE_DELETE_PER_MIN, 60)` |
| `DELETE /resume-analyzer/analyses/{id}` uses `rate_limited` | `backend/app.py:483-486` | `rate_limited("delete", RATE_DELETE_PER_MIN, 60)` |
| `RATE_DRILL_REVIEW_PER_MIN` in config | `backend/config.py:73` | default `30` |
| `RATE_DELETE_PER_MIN` in config | `backend/config.py:74` | default `20` |
| `test_delete_rate_limited_returns_429_with_retry_after` | `backend/tests/test_deletes.py:164-172` | real test: 20×404 then 429 + `Retry-After` header |
| 429 includes `Retry-After` | `backend/app.py:116-121` | header set on `HTTPException` |

Full suites green: pytest **187**, vitest **62**, tsc **0**, lint **0**, build **0**.
