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

## 2026-09-28 Hero dead-space fix

The hero's inner container carried `lg:min-h-[100dvh]` while its content is a
fixed ~651px. Every pixel of surplus was therefore dumped *below* the content, and
because the container was pinned to the viewport the surplus grew with the
viewport. Measured in headless Chromium:

| Viewport | Hero height | Content bottom | Dead space |
|---|---|---|---|
| 1440×954 | 954px | 651px | **303px** |
| 1440×1400 | 1400px | 651px | **749px** |
| 1280×800 | 800px | 651px | **149px** |

`min-h-[100dvh]` was removed so the hero is sized by its content. The same
measurement after the change:

| Viewport | Hero height | Content bottom | Dead space |
|---|---|---|---|
| 1440×954 | 744px | 651px | 93px |
| 1440×1400 | 744px | 651px | 93px |
| 1280×800 | 744px | 651px | 93px |

The hero is now a constant 744px at every viewport, and the remaining 93px is the
section's own `pb-20` bottom padding — normal breathing room, not a layout fault.
The gap no longer scales with the screen, which is what made it read as broken on
a tall monitor. The primary CTA still sits above the fold: hero content ends at
651px, inside a 744px hero.

Two regression tests were added to `Hero.test.tsx` asserting that neither the
section nor its inner container pins itself to a viewport height. They were
written failing first — the inner-container guard failed against the old code,
the section guard passed because the class was only ever on the child.

Mobile is unaffected: the offending declaration was `lg:`-scoped.

`npm run lint` 0 warnings, `npx tsc --noEmit` clean, `npm test` **115 passed /
17 files** (was 113), `npm run build` 18 routes.

## 2026-09-28 Knowledge section completion

The Knowledge page titled itself "Your knowledge base" but could not add to it. The backend already
exposed `POST /knowledge/documents` (`app.py:862`) and the frontend never called it, so the only way
to index anything was to go through Prepare. Three of the five accepted `source_type` values —
`portfolio`, `notes`, `session_report` — were unreachable from any UI, because Prepare only ever
ingests `resume` and `company_intelligence`.

Other gaps found while reading the component:

- `similarity` is returned by `POST /knowledge/search` and was assigned into state but **never
  rendered** — a dead field, so every hit looked equally relevant.
- `top_k` was hardcoded to `5` with no way to change it.
- Delete used `window.confirm`, the only native dialog in the app.
- No refresh control, so adding a source in Prepare required a full page reload.
- The raw enum leaked into the UI: documents displayed as `company_intelligence`.
- The search card rendered even with zero documents, offering to search an empty base.
- No frontend test existed for this panel.

The panel now offers an **Add a source** card wired to the existing endpoint, with all five source
types, a 120-character hint, and explicit feedback distinguishing an ingest from a duplicate (the
backend dedupes by content hash and returns `duplicate: true`). Search shows the similarity score and
a bounded result-count control. Delete confirms in-app with the chunk count so the consequence is
stated, and states that live answers stop drawing on the source. A refresh control re-reads the list.
Raw enums are formatted for display, and the search card is hidden when there is nothing to search.

The initial-load path was refactored onto the same `load` callback the refresh button uses, which
removed a duplicated `Promise.all` that the previous version carried inline.

`components/knowledge/__tests__/KnowledgePanel.test.tsx` (11 tests) was written failing first — all 11
red against the old component. One failure was a test-precision issue rather than a product defect:
"Company intelligence" appears in both the type dropdown and the document metadata, so the assertion
was scoped to the document row.

`npm run lint` 0 warnings, `npx tsc --noEmit` clean, `npm test` **126 passed / 18 files** (was 115 /
17), `npm run build` 18 routes.

## 2026-09-28 Free-by-default AI and bring-your-own-key

Two defects behind the cost question, and the premise it rested on was wrong.

### It was not BYOK

`grep -rli byok` returned zero files. `ai/provider.py` read every provider key from
server-side config (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`,
`OPENROUTER_API_KEY`), so every user's question pack billed the operator's single key.
There was no per-user key storage, no key column, and nothing collected from the user.

### A free-tier 429 was causing spend, not preventing it

```python
except Exception as exc:
    last_err = exc
    # Rate-limit / quota / auth → try the next provider.
    continue
```

The chain was `groq -> openai -> openrouter -> gemini`. Two of those are paid. When the free
Groq tier returned 429 the request did not stop — it continued into OpenAI and OpenRouter
and spent real money. Both `chat()` and `chat_messages()` now report which providers were
tried, and a provider with no usable free tier is only reachable when the **user** supplied
their own key or an operator sets `AI_PROVIDER_ALLOW_PAID=1`.

### Free-tier ceilings, for calibration

A prepare run is 5 LLM calls, ~9,500 input tokens, ~8,200 output tokens. Against the free-for-dev
index (updated 2026-09-27):

| Tier | Ceiling | Usable? |
|---|---|---|
| Gemini Flash | 5 req/min, 20 req/day | 4 runs/day total — no |
| Gemma 4 | 30 req/min, 14.4k req/day, 16k input tok/min | ~1.7 runs/min, input-token bound |
| Groq free | exists | exact free-plan numbers are on the account Limits page |

Free tiers change without notice and vendor pages are the authority. Google states exact limits
are only visible in AI Studio. These are ceilings on the shared key, not on a user with their own key.

### Key storage

`backend/ai/keyring.py`, AES-256-GCM, with the provider name and owning user id bound in as
additional authenticated data — so a ciphertext cannot be replayed under a different provider or
a different user. The master key comes from `AI_KEYS_ENCRYPTION_KEY`; when it is absent the
keyring is **disabled** and the routes return 503. There is no default, so a misconfigured deploy
stores nothing rather than storing plaintext.

Two findings while building it:

- `base64.urlsafe_b64decode` is lenient and silently discards non-alphabet characters, so
  `"not base64 !!!"` decoded to a short key instead of being rejected. The master key is now
  decoded with `validate=True`.
- A `contextvar` set inside a **sync** FastAPI dependency runs in a worker thread and is invisible
  to the endpoint and to the `asyncio.to_thread` calls the workflows use. `get_user` therefore had
  to become `async`, which is why the binding is invisible to all seven provider call sites.

Keys are never returned by the API — only provider plus the last four characters — and a
middleware releases the decrypted material as soon as the response is produced.

### Cost control

`AI_DAILY_RUN_CAP` caps runs per user per UTC day. It is `0` (off) by default. A caller with
their own key is not capped, because that quota is theirs. `cryptography` is now a pinned
dependency rather than relying on it arriving transitively.

### Tests

`test_keyring.py` (19) covers the fail-closed master key, strict base64, AAD binding across users
and providers, tamper detection, rotation, and hint-only display. `test_byok.py` (17) covers the
routes, that the stored value is ciphertext that decrypts back, that the key is never in a
response, paid exclusion and opt-in, user-key priority, and the cap including the BYOK bypass.
`AiKeysCard.test.tsx` (9) covers the settings UI. Two pre-existing chain tests asserted the old
behaviour — that OpenAI joins the chain — and were replaced with the intended rules.

One test-hygiene fix worth recording: `apiMock.mockReset()` in `beforeEach` wiped the mock
implementation while a previous test's component still had an in-flight `load()`, so the failure
surfaced during cleanup as `unhandled undefined` rather than as the assertion it belonged to.
`mockClear` plus a default `respond()` fixed it.

Backend **229 passed** (was 190), frontend **135 passed / 19 files** (was 126 / 18).

## 2026-09-28 Applying the user_ai_keys migration to production

PR #32 merged as `a77ffcc`. The feature ships inert until two things exist, so both
were checked rather than assumed.

`supabase migration list --linked` showed exactly one pending migration and twelve
already applied, so `supabase db push` could not replay anything historical. The
statement is `CREATE TABLE IF NOT EXISTS`, one index, and `enable row level security`
— it touches no existing table and no rows.

```
supabase db push --linked
  Applying migration 20260928010000_user_ai_keys.sql...
Finished supabase db push.
```

Verified through PostgREST: `user_ai_keys` is reachable and holds 0 rows.

The `cryptography` import error from `failed to cache migrations catalog` is about
pg-delta needing Docker for local diffing, not about the push. The push completed and
the table is confirmed present, so it is noise.

### What is deliberately still off

`AI_KEYS_ENCRYPTION_KEY` is not set, because Render's CLI v2.26.0 exposes no
env-var subcommand — there is no `render env`, and `render services update` covers
service configuration rather than environment variables. Setting it needs either the
dashboard or a Render API key, and a key should not be pasted into a chat transcript.

With the keyring disabled the key routes return 503 and everything else is
unaffected, which was confirmed against production:

```
GET /health            -> 200  {"status":"ok","ai_configured":true,"provider":"groq","db_ready":true}
GET /ai/keys  (no auth)-> 401
GET /ai/quota (no auth)-> 401
startup logs           -> no keyring or encryption errors
```

The 401 rather than 503 is the meaningful detail: authentication is rejected before
the keyring is consulted, so an unauthenticated caller cannot learn whether the
keyring is enabled. With the key unset the app is therefore in the same working state
as before, and the paid-provider fix — the part that was actually costing money — is
live and independent of this.

### Setting the encryption key without touching a secret in a transcript

The dashboard was avoided rather than used, and no key was pasted into a chat
transcript. Render CLI v2.26.0 has no env-var subcommand — there is no `render env`,
and `render services update` covers service configuration, not environment variables —
so the REST API was used instead with the credential the CLI already had in
`~/.render/cli.yaml`, read into a shell variable and never printed.

The secret is generated locally and stored outside the repository at
`~/.config/hustlrzz/AI_KEYS_ENCRYPTION_KEY` with mode 600, so it exists in exactly two
places: that file and Render. The script is idempotent and reuses an existing file
rather than regenerating, because regenerating after keys have been stored would make
those keys permanently unreadable.

`PATCH /v1/services/{id}/env-vars` returns 405 — that route is GET/PUT/DELETE only.
`PUT /v1/services/{id}/env-vars/{KEY}` is the correct single-key upsert and is also
safer, since it cannot disturb the other eleven variables. Confirmed afterwards: 12
env vars, and the value read back from Render matches the local file byte for byte.

A restart was not sufficient evidence. `render restart` returned success but the
service answered `/health` within five seconds, and the log buffer had already scrolled
past any startup line, so there was no way to show a new process had read the new
environment. A forced API deploy was used instead, which produced an unambiguous
sequence:

```
Live  e3edc4b  trigger=api  dep-dat4720jo6nc73e6gfog  10:38:00 -> 10:38:35
10:38:32  Waiting for application startup.
10:38:32  Application startup complete.
10:38:32  Uvicorn running on http://0.0.0.0:10000
```

No keyring, encryption, or traceback output. That process provably holds the current
environment.

The stored value was then run through the real keyring code locally rather than
assumed valid:

```
is_enabled()                    True
round trip                      ok
ciphertext contains plaintext   False (72 chars)
key_hint                        ...MNOP
cross-user decrypt              refused (KeyringDecryptError)
cross-provider decrypt          refused (KeyringDecryptError)
is_paid_provider(groq/openai)   False / True
```

Together with the applied migration and the fresh deploy, the chain is complete:
table exists, secret is valid under the shipping code, and the running process has it.
What cannot be shown from here is the authenticated round trip, since the key routes
return 401 without a session. That last check is a UI one — the key form in Settings
should no longer read "Not enabled on this deployment".

## 2026-09-28 Sanitising the marketing claims and the README

Two honesty problems found while wrapping up, both about numbers that read as
measurements.

### Fabricated figures on the landing page

`98.4%` (resume match), `0.4/m` (filler count), `98%` (posture hold), `100%` (on-device),
the 80/80/88 telemetry bars, and "Yesterday's session logged 14 probes" were all rendered
with no indication they were illustrative. A visitor reads those as results measured on
them. The hero panel was the only one with a visible label, and even it had two false
marks of precision: `Simulated cockpit v2.4` and `Latency: 24ms`.

Fixed by adding a visible `Sample data` marker rather than a disclaimer, because a
disclaimer nobody reads is not a correction. `PanelLabel` gained a `sample` prop so the
marker sits inline with the label it qualifies, and the three metric tiles got one above
the row. The hero now reads `Simulated session` with `Not a live measurement` in place of
the invented latency, and the fake version number is gone.

### The README described a product that no longer exists

Line 91 still claimed "Groq (Qwen) primary with automatic Gemini fallback" and said
nothing about the paid providers, which is the exact configuration that was costing
money. More seriously, **the README never mentioned bring-your-own-key at all** — an
entire shipped feature was absent, as were the `/ai/keys` and `/ai/quota` routes, the
three AI environment variables, the `user_ai_keys` migration, and the
`project-docs/`, `project-specs/`, and `project-tasks/` directories.

It now carries a BYOK section with the encryption scheme, the fail-closed behaviour, and
the limitation that this backend can decrypt user keys while proxying — stated in the
README rather than only in a commit message, because that is the document a new
contributor or evaluator reads.

The generation instruction for the master key is documented, with a warning to store it
durably, since it is the only thing that can decrypt stored user keys.

Verified: frontend lint clean, `tsc` clean, 135 tests / 19 files, build compiled.
