# EvidenceQA — Phase 2 closeout command outputs

Run: 2026-09-25, repo `/Users/dgsmacbook/hustlrzz`, local quality gates exit 0.

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
190 passed, 4 warnings in 50.90s
```

Exit code: **0**. Final count: **190 passed**.

## npm test (vitest)

```
npm test   # → vitest run
```

```
 RUN  v3.2.7 /Users/dgsmacbook/hustlrzz/frontend

 ✓ lib/__tests__/api.test.ts (11 tests) 4ms
 ✓ lib/__tests__/reportMarkdown.test.ts (17 tests) 6ms
 ✓ lib/__tests__/download.test.ts (3 tests) 11ms
 ✓ lib/__tests__/sessionDetail.test.ts (7 tests) 3ms
 ✓ lib/supabase/__tests__/client.test.ts (7 tests) 62ms
 ✓ components/ui/__tests__/button.test.tsx (6 tests) 115ms
 ✓ components/auth/__tests__/AuthGate.test.tsx (5 tests) 167ms
 ✓ lib/__tests__/settings.test.ts (7 tests) 2ms
 ✓ lib/__tests__/analytics.test.ts (5 tests) 2ms
 ✓ components/home/__tests__/Hero.reduced-motion.test.tsx (2 tests) 70ms
 ✓ components/home/__tests__/Hero.test.tsx (6 tests) 106ms

 Test Files  11 passed (11)
      Tests  76 passed (76)
   Duration  2.30s
```

Exit code: **0**. Final count: **76 passed / 11 files**.

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

Full suites green: pytest **190**, vitest **76**, tsc **0**, lint **0**, build **0**.

## 2026-09-25 closeout gates

| Gate | Result |
|---|---|
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `backend/.venv/bin/python -m pip_audit -r backend/requirements.txt` | No known vulnerabilities |
| `supabase db push` | Applied `20260925123000_practice_feedback_sessions` |
| `supabase migration list` | Local and remote migration histories match |
| `curl https://hustlrzz-api.onrender.com/health` | `status=ok`, `ai_configured=true`, `db_ready=true` |
| Lighthouse desktop light | Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100 |
| Lighthouse desktop dark | Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100 |
| Lighthouse mobile dark | Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100 |
| Signed-out route shells | `/prepare`, `/interview`, `/dashboard`, `/coaching`, `/settings`, `/knowledge` all render AuthGate sign-in |

## 2026-09-26 landing page pass (local production build, `next start`)

Lighthouse was re-measured after the hero rebuild. **Best Practices is 96, not 100**, on both this
build and the deployed site. Cause: `errors-in-console` from `GET /api/auth/session` returning
`401` for signed-out visitors. Verified pre-existing — the deployed site at `64daa64`, which does
not contain this change, logs the identical 401 and also scores 96. Left unfixed here because it
sits in auth code outside this change's scope.

| Gate | Result |
|---|---|
| Lighthouse desktop light | Accessibility 100, Best Practices 96, SEO 100, Agentic Browsing 100 |
| Lighthouse desktop dark | Accessibility 100, Best Practices 96, SEO 100, Agentic Browsing 100 |
| Lighthouse mobile dark (390x844) | Accessibility 100, Best Practices 96, SEO 100, Agentic Browsing 100 |
| `h1` outranks every `h2` | 72px vs 48px at 1440; 60 vs 48 at 768; 36 vs 30 at 320/390 |
| Horizontal overflow | none at 320, 390, 768, 1024, 1440 |
| Touch targets under 44px | none, except the visually hidden skip link |
| Reduced motion | 3 steps render complete, zero inline transforms in the hero |
| `/robots.txt` | now `200 text/plain` (was `404` returning the Next 404 page) |
| `/llms.txt` | now `200 text/plain` (was `404` returning the Next 404 page) |

### Pre-existing production defect found during this pass

`https://hustlrzz.vercel.app/robots.txt` and `/llms.txt` both returned **404 with the Next.js 404
HTML page**. Lighthouse on the deployed domain therefore failed `robots-txt` and `llms-txt`,
scoring **SEO 91 and Agentic Browsing 67** in production while the same audit on localhost scored
100 — the earlier "SEO 100 / Agentic 100" evidence was measured on localhost, where those two
audits do not apply. Fixed by adding `frontend/public/robots.txt` and `frontend/public/llms.txt`.

### Production re-verification after deploy `20ef97b`

| Check | Result |
|---|---|
| `https://hustlrzz.vercel.app/robots.txt` | `200 text/plain` |
| `https://hustlrzz.vercel.app/llms.txt` | `200 text/plain` |
| Lighthouse production, desktop light | Accessibility 100, Best Practices 96, **SEO 100** (was 91), **Agentic Browsing 100** (was 67) |
| Deployed heading hierarchy | h1 72px, all h2 48px |
| Deployed nav | Hustlrzz, Prepare, Rehearse, Coach, Start preparing |
| Deployed value chain | 3 labelled steps; score bars 30/20/26/16/23px |
| Deployed horizontal overflow | none at 1440 |

The SEO and Agentic Browsing recovery is the point of this deploy. Best Practices remains 96 for
the pre-existing `401` reason traced above.

Authenticated production smoke evidence remains pending deployment of the current branch.
