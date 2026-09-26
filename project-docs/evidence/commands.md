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

 ✓ lib/__tests__/download.test.ts (3 tests) 8ms
 ✓ lib/__tests__/api.test.ts (11 tests) 8ms
 ✓ lib/__tests__/sessionDetail.test.ts (7 tests) 11ms
 ✓ app/api/auth/session/__tests__/route.test.ts (5 tests) 10ms
 ✓ lib/supabase/__tests__/client.test.ts (7 tests) 85ms
 ✓ components/ui/__tests__/button.test.tsx (6 tests) 168ms
 ✓ components/auth/__tests__/AuthGate.test.tsx (5 tests) 212ms
 ✓ lib/__tests__/reportMarkdown.test.ts (17 tests) 4ms
 ✓ lib/__tests__/analytics.test.ts (5 tests) 3ms
 ✓ lib/__tests__/settings.test.ts (7 tests) 3ms
 ✓ components/home/__tests__/Hero.reduced-motion.test.tsx (2 tests) 70ms
 ✓ components/home/__tests__/Hero.test.tsx (9 tests) 126ms
 ✓ lib/__tests__/serviceWorker.test.ts (8 tests) 843ms

 Test Files  13 passed (13)
      Tests  92 passed (92)
   Duration  2.51s
```

Exit code: **0**. Final count: **92 passed / 13 files**.

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

Full suites green: pytest **190**, vitest **92**, tsc **0**, lint **0**, build **0**.

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

### Typography and art direction

The page was previously set entirely in Geist Sans at `tracking-tighter` — the most recognisable
generated-landing-page treatment available. Instrument Serif (self-hosted via `next/font/google`)
now carries the h1, section headings, marquee, mode titles and manifesto thesis; Geist remains on
body copy, controls and card titles so the two roles stay distinct. The hero reads as an opening
slide: `01 / INTERVIEW PREP` over a hairline rule, the headline with *unforgettable* in true italic,
and the three-step chain as an agenda panel with serif numerals. The pill-shaped SVG accent is
removed from both the hero and the bento heading; its asset and the orphaned `.display-type`
utility are deleted.

Instrument Serif ships 400 only, so `font-semibold` was removed from every display heading —
leaving it makes the browser synthesise a fake bold, which is a visible craft failure on a face
this high-contrast.

| Check | Result |
|---|---|
| Rendered h1 family | `Instrument Serif` at `font-weight: 400` |
| Italic emphasis | `font-style: italic` on *unforgettable.* |
| Heading hierarchy | h1 76px vs h2 48px at 1440; 38 vs 32 at 390 |
| Contrast, alpha-blended, both themes | **zero failures** |
| h1 contrast | 19.9:1 light, 18.1:1 dark |
| Worst contrast anywhere on the page | 5.2:1 against a 4.5 floor |
| Marquee words | alpha-blended 3.46:1 light against a 3:1 floor at 80% opacity; raised to 90% opacity, now 6.43:1 dark |

The first contrast audit **ignored alpha** and therefore overstated ratios for `muted-foreground/80`
text. It was redone with alpha compositing against the resolved background.

### Session endpoint: signed-out 401 removed

`GET /api/auth/session` returned **401** when there was no refresh cookie and when a refresh token
was rejected. "Not signed in" is a successful answer to a session probe, and the 401 logged a
console error on every signed-out pageview, which failed the `errors-in-console` audit and held
Best Practices at 96. It now returns **200 with `{ session: null }`** in both cases and still clears
a rejected cookie. A genuine Supabase misconfiguration still returns **503**, so real server faults
are not masked.

Client behaviour is unchanged: `restoreSessionFromCookie` returns `null` for both a non-OK response
and a null session, so `AuthGate` takes the identical path either way.

| Gate | Result |
|---|---|
| `npm test` | **92 passed / 13 files** (5 session-route + 8 service-worker tests) |
| `npm run lint`, `npx tsc --noEmit`, `npm run build` | clean, 17 routes |
| Lighthouse — Accessibility | **100** |
| Lighthouse — Best Practices | **100** (was 96) |
| Lighthouse — SEO | **100** |
| Failing Lighthouse audits | **none** |
| Browser console errors on `/` | **0** |
| HTTP 4xx/5xx on `/` | **0** |
| `GET /api/auth/session` signed out | `200 {"session":null}` |
| Horizontal overflow | none at 320, 390, 1440 |
| Touch targets under 44px | none, except the visually hidden skip link |
| Reduced motion | 3 steps render complete, zero inline transforms in the hero |
| `/robots.txt`, `/llms.txt` | `200 text/plain` |

Lighthouse was run with `lighthouse@12` against the local production build.

### Service worker was breaking crawler access

With `robots.txt` added, Lighthouse on the deployed domain still failed `robots-txt` with
"Lighthouse was unable to download a robots.txt file", even though `curl` returned the file
correctly with `200 text/plain`. Cause: `sw.js` routed every same-origin GET that was not a
navigation through `cacheFirst`, so `robots.txt` was claimed by the worker. `cacheFirst` had no
error handling, so any network failure rejected the promise and the request failed outright — the
worker could answer a crawler file with a synthetic offline 503.

The worker now claims only what it actually serves — document navigations, RSC requests, and static
assets — and passes everything else straight to the network. `robots.txt`, `llms.txt`,
`sitemap.xml` and `manifest.webmanifest` are explicitly network-only, `cacheFirst` gained the error
handling `networkFirst` already had, and the cache is bumped to `hustlrzz-v3` so entries cached by
the old handler are dropped on activation.

Verified in a browser with a **controlling** worker, which is the condition that reproduced the
failure:

| Check | Result |
|---|---|
| `navigator.serviceWorker.controller` | `true` |
| Active cache | `hustlrzz-v3` only |
| `/robots.txt` fetched through the worker | `200 text/plain`, real content |
| `/llms.txt` fetched through the worker | `200 text/plain`, real content |
| Console errors on `/` | 0 |

Offline navigation degradation was not re-verified: the probe used `fetch(..., { mode: "navigate" })`
from a page context, which the browser rejects regardless of the worker. The 503 offline fallback is
untested.

### Previously recorded defect, now fixed

`https://hustlrzz.vercel.app/robots.txt` and `/llms.txt` both returned **404 with the Next.js 404
page**. Lighthouse on the deployed domain therefore failed `robots-txt` and `llms-txt`, scoring
**SEO 91 and Agentic Browsing 67** in production while the same audit on localhost scored 100 — the
earlier "SEO 100 / Agentic 100" evidence was measured on localhost, where those two audits do not
apply. Fixed by adding `frontend/public/robots.txt` and `frontend/public/llms.txt`, confirmed live.

Authenticated production smoke evidence remains pending a signed-in session.
