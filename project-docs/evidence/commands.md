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

Full suites green: pytest **190**, vitest **102**, tsc **0**, lint **0**, build **0**.

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
| `npm test` | **102 passed / 15 files** |
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

### Offline degradation, measured and then fixed

The first attempt used `fetch(..., { mode: "navigate" })` from a page context, which the browser
rejects regardless of the worker, so it proved nothing. Redone with a real document navigation while
the context was offline, it showed precached routes were fine and everything else was not:

| Offline route | Before | After |
|---|---|---|
| `/` | 200, full cached homepage | unchanged |
| `/prepare` | 200, cached shell with its own offline notice | unchanged |
| `/knowledge` | **503, plain text "Offline"** | 503, styled HTML document |
| `/settings` | **503, plain text "Offline"** | 503, styled HTML document |

"Offline" as plain text is a dead end — no styling, no navigation, no way back. A navigation now
receives a self-contained HTML document: wordmark, honest copy, a 44px on-brand button back to the
precached homepage, `prefers-color-scheme` support, `noindex`, and `Cache-Control: no-store`. It
references no remote assets, because there is no network to fetch them from. Non-navigation requests
still get plain text, since an HTML page in reply to an image request would be wrong.

Verified in-browser with a controlling worker at 390x844: status 503, `text/html`, title
"Offline — Hustlrzz", `h1` "You are offline", one `a[href="/"]` at 44px, `h1` font-size 28px, and
zero remote asset references.

### Reduced motion made consistent

The hero rendered no motion components under `prefers-reduced-motion`, but `hooks/useSprings.ts`
applied a stiffness-1000 spring instead — "very fast" rather than "no motion". `useHoverSpring`,
`usePressAndHover`, `useFlexSpring` and `usePressable` now leave the spring at its resting value when
reduced motion is requested, so nothing moves. `isExpanded` still flips, so accordion copy guarded by
the flex spring stays reachable by keyboard and by reduced-motion users.

Verified in-browser with `prefers-reduced-motion: reduce` emulated:

| Check | Result |
|---|---|
| Hero inline transforms | 0 |
| Hero value chain | 3 steps rendered complete |
| Accordion focus | copy opacity 1, text "Prepare" readable |
| Accordion flex growth | stays 1, no movement |
| Primary CTA hover | transform unchanged |

`usePressable`, `useSpringValue` and `useScrollReveal` are exported but never called anywhere in the
app — pre-existing dead code, left in place. `useScrollReveal` already returns static values under
reduced motion.

### Sitemap

`app/sitemap.ts` publishes the three public routes; `robots.txt` references it. The service worker
already treats `/sitemap.xml` as network-only. `/sitemap.xml` returns `200 application/xml`.

### Previously recorded defect, now fixed

`https://hustlrzz.vercel.app/robots.txt` and `/llms.txt` both returned **404 with the Next.js 404
page**. Lighthouse on the deployed domain therefore failed `robots-txt` and `llms-txt`, scoring
**SEO 91 and Agentic Browsing 67** in production while the same audit on localhost scored 100 — the
earlier "SEO 100 / Agentic 100" evidence was measured on localhost, where those two audits do not
apply. Fixed by adding `frontend/public/robots.txt` and `frontend/public/llms.txt`, confirmed live.

Authenticated production smoke evidence remains pending a signed-in session.

## 2026-09-27 landing page replacement (reference `screen.png`)

The hero panel and every section below it were rebuilt to match a supplied reference image. The
existing design system was reused throughout — no new dependency, no new token file.

### Hero panel: agenda chain → "SIMULATED COCKPIT v2.4"

The three-step chain keeps its `ol aria-label="How it works"` and its stage labels, so the existing
hero contract tests still assert against it. What changed is the presentation: a `SIMULATED
COCKPIT v2.4` / `Latency: 24ms` header, a `VERIFY` badge over a resume-extraction note with a file
chip, a `DYNAMICS A1` badge over a `RAG synthesis` question, and a `MIC ACTIVE` badge over a
five-bar level meter with `Pace: 148 wpm (Optimal)` and `Eye contact: 94%`.

The panel is explicitly labelled **SIMULATED** in its visible header, and the static values are
presented as part of that labelled simulation. This is the same honesty boundary that removed the
testimonial block: the page must not present illustrative telemetry as a real visitor result.

Stages still play once on mount, hold, and replay on pointer-enter or focus. They never loop. Under
`prefers-reduced-motion` the panel renders its finished state with no `motion` nodes at all.

### Sections

| Section | Before | After |
|---|---|---|
| Bento | 4 cards, copy only | 4 cards, each with a labelled telemetry panel (resume signals, target bars, AI-interview quote, three metric tiles) |
| Trust row | 3 short labels | `Voice and typing modalities`, `Multi-provider failover gateway`, `Zero-cloud client processing` |
| Mode cards | 4 hover-expanding flex accordions over grayscale photo collages | 4 equal cards, line-art Phosphor icon, title, descriptor, arrow |
| Manifesto | Plain scrubbed thesis | Decorative serif quote marks; tail copy now names evidence, the company bar, and an executive coach |
| Marquee | Serif, upright | Serif, italic |
| Closing | Single line | `Your next interview` / *starts tonight.* on its own line |
| Footer | 3-up row, privacy line third | Wordmark + `Process by design. Your camera never leaves the browser.`, nav, separate copyright row |

`useFlexSpring` lost its last call site when the accordions were replaced and was removed from the
`useSprings` import. The `Microphone` icon import in `HeroValueChain.tsx` was likewise dropped when
`Verify` moved to a `CheckCircle` badge.

### Text integrity

The split closing heading is written as `Your next interview{" "}` before the `<br />`, so
`textContent` and copy-paste yield `"Your next interview starts tonight."` rather than concatenating
without a separator.

### Checks

| Check | Result |
|---|---|
| Horizontal overflow at 390 | `scrollWidth 375` vs `clientWidth 375` — **0px** |
| Interactive targets under 44px at 390 | 1 — `Skip to content`, a visually-hidden-until-focused link (pre-existing, expands on focus) |
| Cockpit panel at 390 | Header, badges, file chip, quote and meter all legible; no truncation |
| `npm run lint` | clean, 0 warnings |
| `npx tsc --noEmit` | clean |
| `npm test` | **102 passed / 15 files** |
| `npm run build` | 18 routes, `/` static |

## 2026-09-28 Google OAuth and slow first load

Both defects were diagnosed without opening a browser: the Supabase public API was probed with
`curl`, and the failure was located by reading the installed `@supabase/auth-js` source rather than
by guessing.

### Google sign-in: root cause

`GET /auth/v1/settings` reported `"google": true`, and `GET /auth/v1/authorize` returned **302 to
accounts.google.com** for all three redirect targets tried, including the query-string form
`https://hustlrzz.vercel.app/auth/callback?next=%2Fprepare`. The provider and the redirect allow list
were both healthy, so the fault was client-side.

`getSupabase()` was configured with `persistSession: false`. In `@supabase/auth-js` 2.112.4 that
selects a **memory-backed storage adapter**:

```js
if (this.persistSession) { this.storage = globalThis.localStorage; }
else { this.storage = memoryLocalStorageAdapter(this.memoryStorage); }
```

A PKCE flow writes a `code_verifier` before the browser leaves for the provider and needs it again on
the way back. That round trip is a **full page unload**, so a verifier held only in the JS heap was
gone by the time `/auth/callback` ran. `_isPKCECallback()` then found no verifier, `callbackUrlType`
stayed `'none'`, and `_getSessionFromURL()` was never called — so no code exchange happened at all.
The callback page reported *"Google returned without creating a session. Verify the Google provider
and redirect URLs in Supabase."*, which pointed at a configuration that was in fact correct.

The fix splits the storage adapter by key suffix. `/‑code-verifier$/` covers all three shapes that
auth-js writes — the slot key `…-flow-<id>-code-verifier`, the pending-flow index
`…-flows-code-verifier`, and the legacy fixed key `…-code-verifier` that `storePKCEVerifier` still
dual-writes so that callbacks without a flow id can find their verifier. Those go to `sessionStorage`,
which survives the redirect and dies with the tab. The session and user keys stay memory-only, so
access and refresh tokens never reach browser storage, and `persistSession: true` is now required so
auth-js reads the adapter on init and locates the verifier.

`signInWithOAuth` was left alone: `_handleProviderSignIn` already calls `window.location.assign(url)`
itself, so there was no second defect there.

### Slow first load: root cause

`AuthGate` began with `loading = true` and returned a full-screen spinner until
`restoreSessionFromCookie()` **and** `getSession()` both resolved — a server round trip on every page,
including the public front page, which renders its children signed out anyway. `/api/auth/session` had
been measured between 0.4s and 9.5s, and the whole page waited for it. The homepage also server-rendered
as that empty shell, so crawlers received a page with no content in it.

The gate now skips the blocking spinner on the public route only. Protected routes still wait, so a
signed-in user is never shown the sign-in form. The configuration-error screen still takes precedence
over the bypass.

| Check | Before | After |
|---|---|---|
| `GET /` SSR payload | 13,153 bytes, no page content | **51,929 bytes**, full hero, cockpit, bento, modes, manifesto, closing |
| `GET /` crawler-visible content | none | `Simulated cockpit`, `Walk in rehearsed`, `staff_product_designer_resume`, `The full room`, `starts tonight` all present in the HTML |
| `GET /prepare` | 13,656 bytes, `aria-label="Loading"` | unchanged — still gated, no protected content in the HTML |
| `GET /dashboard` | 13,664 bytes | unchanged — still gated |
| `GET /coaching` | 14,271 bytes | unchanged — still gated |

### Tests

`lib/supabase/__tests__/clientStorage.test.ts` (7) and
`components/auth/__tests__/AuthGate.publicRoute.test.tsx` (4) were written failing first. The
AuthGate file asserts the public page renders while the probe is still in flight, that a protected
route still shows the loading status, and that the configuration error still wins. The storage file
asserts the verifier survives a module reload, the session and user keys never reach `localStorage`
or `sessionStorage`, a blocked `sessionStorage` throws nothing, and the client is handed a real
adapter with `persistSession: true`.

`npm run lint` 0 warnings, `npx tsc --noEmit` clean, `npm test` **113 passed / 17 files** (was 102 /
15), `npm run build` 18 routes.

A real Google sign-in still needs one interactive confirmation, because the verifier→provider→callback
round trip is browser behaviour. The server legs are verified and the mechanism is unit-tested.

### Google-side configuration verified headlessly

The `/auth/v1/authorize` 302 above only proves Supabase is *willing* to start a flow — it will hand any
`redirect_to` to Google. The Google side of the chain was checked separately by following the redirect
and reading what Google returns:

```
redirect_uri = https://<project-ref>.supabase.co/auth/v1/callback
response_type = code
scope = email profile
→ HTTP 200, 895,535-byte "Sign in with Google" consent page
   no redirect_uri_mismatch, no invalid_client, no Error 400
```

That confirms the Google Cloud OAuth client exists and is recognised, the client-secret pairing is
correct, and `https://<project-ref>.supabase.co/auth/v1/callback` is present in the console's authorized
redirect URIs. A misconfigured Google console would have returned `redirect_uri_mismatch` here. This was
the last remaining link that could have been wrong in a dashboard, and it is not.

Every leg of the Google path is now confirmed without a browser: provider enabled, Supabase accepts our
`redirect_to`, Google accepts Supabase's `redirect_uri`, and the PKCE verifier survives the round trip by
unit test. What remains is the user's own consent click and the return leg, which is browser behaviour.

### Deployment state at handoff

`main` = `origin/main` = `642bb2a`, working tree clean, no diverged branches. Production serves
52,490 bytes for `/` — a payload that only exists at this commit; before it the route returned a
13,153-byte spinner shell. All surfaces 200: `/`, `/prepare`, `/robots.txt`, `/llms.txt`,
`/sitemap.xml`, `/api/auth/session`, `/auth/callback`, and the Render `/health` endpoint.
Production Lighthouse after this change: accessibility 100, best practices 100, SEO 100, no failing
audits.
