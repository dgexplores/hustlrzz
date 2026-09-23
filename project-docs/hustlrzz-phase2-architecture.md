# Hustlrzz Phase 2 — Architecture

**Role**: ArchitectUX (AgentsOrchestrator pipeline)
**Spec**: `project-specs/hustlrzz-phase2-setup.md` (authoritative scope)
**Tasklist**: `project-tasks/hustlrzz-phase2-tasklist.md`
**Design contract**: `docs/DESIGN_CONTRACT.md` (T10 constraints)
**Base**: `main` @ security-hardened `97fb285`
**Date**: 2026-09-23

Contracts and patterns only. No application code in this document. Implementation agents follow these contracts; they do not reinterpret them.

---

## 1. Shared conventions

### 1.1 API response shapes

All JSON endpoints return one of:

| Case | Shape |
|---|---|
| Success with payload | `{"success": true, "data": <T>}` |
| Success with no body (delete) | HTTP `204`, empty body |
| Error | FastAPI `HTTPException` → `{"detail": "<human message>"}` with proper status |

- Never invent a new envelope. `success`/`data` matches existing routes (`/workflows`, `/interviews`, `/knowledge/status`).
- Error `detail` strings are user-facing: human-readable sentence, no stack traces, no Pydantic internals. Frontend `humanizeDetail` in `frontend/lib/api.ts` still applies as a fallback.
- Status codes in use: `401` missing/invalid token, `403` reserved (prefer 404 for ownership misses), `404` not found **or** not owned, `409` conflict (avoid — see T4 decision), `422` validation, `429` rate limited (with `Retry-After`), `503` DB/provider not ready.
- Ownership failures always return **404**, never 403 (no existence oracle).

### 1.2 Owner auth pattern

Every user-data route uses one of two established patterns:

1. **List/detail with table access** — `user: dict = Depends(get_user)` (or `rate_limited(...)` which wraps `get_user`), then every query filters `.eq("user_id", user["uid"])` / `dbc.select_where(table, {"user_id": ..., "<id_col>": ...})`.
2. **Service-layer owned load** — a private `_load_owned(<id>, user_id) -> dict | None` helper (pattern: `backend/assessment/service.py:205`); `None` → `HTTPException(404)`.

Rules:
- Never return a row whose `user_id` ≠ caller.
- Deletes: load owned first (404 if missing), then delete by both id and user_id (defense in depth), then `204`.
- `get_user` returns `{"uid", "email", "name", "picture"}` — `uid` is the Supabase auth user id used everywhere as `user_id`.
- `_db_or_503()` before any table touch when DB readiness is not already guaranteed by the dependency.

### 1.3 Rate limit scopes

`rate_limited(scope, limit, window_seconds)` binds to `user["uid"]`. Reuse existing config limits in `backend/config.py`; do not invent per-task numeric limits without adding a named config constant.

| Scope | Existing use | Apply to (phase 2) |
|---|---|---|
| `knowledge` | ingest/search | `DELETE /knowledge/documents/{id}` (or reuse `get_user` + light limit) |
| `workflows` | workflow start | `DELETE /workflows/{id}` optional; delete is cheap → `get_user` acceptable |
| `interview` | interview start | — |
| `coaching` | coaching endpoints | — |
| `assessment` / `assessment_submit` | assessment | — |
| `feedback` (**new**) | — | `POST /feedback` — new small limit, e.g. config `RATE_FEEDBACK_PER_MIN` |
| `analytics` (**new**) | — | `GET /analytics/summary` (or `get_user` only; summary is cheap) |
| `memory` (**new**, optional) | — | `POST /memory/drills/{skill}/review` |

New scopes must be distinct string keys (they namespace the limiter key `f"{scope}:{uid}"`).

### 1.4 Migration naming & shape

- Path: `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`
- Style: `create table if not exists public.<table> (...)`; enable RLS; deny direct client access where service-role-only (mirror `20260923000000_rate_limit_events.sql`), or user-scoped RLS policies where the anon/authenticated client may read own rows.
- Idempotent: `if not exists`, `create or replace` for functions.
- Phase 2 migrations (planned names):

| Migration | Table |
|---|---|
| `20260923120000_report_feedback.sql` | `report_feedback` |
| `20260923130000_product_events.sql` | `product_events` |
| `20260923140000_drill_reviews.sql` | `drill_reviews` |
| `20260923150000_interview_intensity.sql` (if column on existing table; else DDL only) | `interview_sessions` / `workflows` column |

Exact timestamps assigned at implementation to keep strict ordering; slug names above are fixed.

### 1.5 Frontend component / panel patterns

- **Route shell**: `frontend/app/<route>/page.tsx` imports `AuthGate` + one content component (pattern: `frontend/app/dashboard/page.tsx`).
- **Content component**: `"use client"` panel under `frontend/components/<domain>/` (e.g. `KnowledgePanel.tsx`, `SettingsPanel.tsx`). Owns fetch, loading spinner, error banner, empty state.
- **Data access**: only via `api<T>("/path")` from `frontend/lib/api.ts`. Never call `fetch` on `API_URL` directly; never read tokens from `localStorage` (session comes from httpOnly cookie restore in `lib/supabase/client.ts`).
- **Exports**: `downloadJson` stays; new `downloadMarkdown` (or `downloadText`) lives in `frontend/lib/download.ts`.
- **Nav**: add entries to `AuthGate` desktop `nav`/`moreNav` arrays and mobile nav array together (single source: the arrays at the top of the signed-in branch). Settings goes into `moreNav` + mobile list (or primary nav if owner prefers — default: `moreNav`).
- **Motion/visual**: 160–200ms transitions, 0.97 press scale, cobalt `primary`, grotesk tracking `[-0.04em]`, surfaces `rounded-2xl border bg-card`. No new colors. See `docs/DESIGN_CONTRACT.md`.
- **Lists with destructive actions**: row-level control → `window.confirm(...)` (native, matches "simple dialog" allowance) → API call → remove row from local state / bump `reloadKey`.

### 1.6 Test patterns

**Backend (pytest)**

- Path bootstrap: `sys.path.insert(0, ...)` to repo root (existing style in every test file).
- Unit tests: monkeypatch `backend.db` (`select_where`, `insert`, `upsert`, `delete_where`, `get_client`) with fakes; pure logic tested directly.
- HTTP tests: `fastapi.testclient.TestClient` + `app.dependency_overrides[get_user] = lambda: USER` (pattern: `backend/tests/test_integration.py`). Clear `limiter._events` per test when rate limits matter.
- Assertions: status codes (204/404/429), ownership isolation (user A id under user B → 404), golden/prompt equality for T11.
- Run: `backend/.venv/bin/python -m pytest backend/tests/ -q`.

**Frontend (vitest + RTL)** — introduced by T6

- Co-locate: `frontend/lib/__tests__/download.test.ts`, `frontend/lib/__tests__/api.test.ts`, etc. (or `*.test.ts` beside source — pick one in T6 and stick to it).
- `api.ts`: mock `fetch` + mock `getSupabase().auth.getSession`; assert Authorization header, 401 mapping, humanized detail.
- `download.ts`: mock `URL.createObjectURL` / anchor click.
- `client.ts`: unit-test cookie-restore guards with mocked supabase.
- Component smoke: render AuthGate happy/error paths with mocked supabase module.
- Script: `"test": "vitest run"` in `frontend/package.json`; CI runs `npm test` **after lint/tsc, before build** (spec: "before build").

---

## 2. Orchestrator decisions (authoritative — do not re-litigate)

| ID | Decision |
|---|---|
| **T4 duplicate POST** | **Upsert one rating per `session_id`.** Unique constraint on `session_id`; second POST replaces rating/comment (same user, owner-of-session). HTTP `200` with updated row, not 409. Document in migration comment + endpoint docstring. |
| **T4 summary** | **Include `GET /feedback/summary`** — authenticated, returns **caller's own** average (owner average: avg + count of caller's `report_feedback` rows). Not an admin/global dashboard. |
| **T7 unknown/foreign id** | **Redirect to `/dashboard`** (soft fail, no 404 page for foreign ids). Do not leak existence. |
| **T7 dashboard history** | **Keep accordion as preview + add link** to `/dashboard/session/[id]` ("Open full session"). Deep link is the canonical full view; accordion stays. |
| **T8 analytics storage** | **`product_events` table + `GET /analytics/summary`** (auth). No third-party analytics SDK. |
| **T9 intervals** | Advance `[1, 3, 7, 14]` days on `good`; reset to index 0 (day 1) on `again` (spec-fixed). |
| **T11 default** | `standard` must produce byte-identical (or golden-equal) interviewer system prompt vs current behavior. |
| **T2 status codes** | `204` success, `404` missing or not owned (spec). |
| **Billing / mobile / provider swap** | Out of scope — reject any task creep. |

---

## 3. Per-task architecture

### T1 — Knowledge base workspace

**Endpoints**
- `GET /knowledge/documents` — auth (`get_user`); list caller's rows from `knowledge_documents` (`document_id`, `title`, `source_type`, `chunk_count`, `created_at`); ordered by `created_at` desc. Response `{success, data: [...]}`.
- `DELETE /knowledge/documents/{document_id}` — auth; verify ownership (`.eq("user_id", uid)` + id); call existing rag delete path (`rag/service.py` already deletes `knowledge_documents` + chunks — extend service with `delete_document(document_id, user_id)` enforcing owner match); `204` or `404`.
- Existing unchanged: `GET /knowledge/status`, `POST /knowledge/documents` (ingest — keep Prepare as primary ingest), `POST /knowledge/search`.

**Tables**: `knowledge_documents`, `knowledge_chunks` (read/delete only; no schema change).

**UI**: route `/knowledge` → `AuthGate` + `KnowledgePanel`. Sections: status banner (`/knowledge/status`), search box (existing search API, show `source_title`/`source_type` labels), document list with per-row delete (`confirm` → DELETE → remove row). Nav: `moreNav` + mobile.

**Files (high level)**: `frontend/app/knowledge/page.tsx`, `frontend/components/knowledge/KnowledgePanel.tsx`, `frontend/lib/api.ts` (thin helpers if needed), `frontend/components/auth/AuthGate.tsx`, `backend/app.py` (or knowledge router), `backend/rag/service.py`, `backend/tests/` (new `test_knowledge_workspace.py` or extend `test_rag.py`).

**Edge cases**
- RAG unavailable (`GEMINI_API_KEY` missing / DB down): list can still work from Postgres rows; search/delete return 503 with human message; status banner shows unavailable.
- Foreign `document_id` → 404 (no rag side effects).
- Delete idempotency: second delete → 404 (row already gone).
- Empty list → empty state copy, not error.

**QA hooks**: pytest 204/404/ownership (fake db); EvidenceQA: status loads, list after prepare upload, delete removes from GET, search labels, cross-user 404.

---

### T2 — Content deletion (API + UI)

**Endpoints**
- `DELETE /workflows/{workflow_id}` → owned check → delete `workflows` row (+ consider related interviews? **No** — sessions keep `workflow_id` but remain readable; only delete the workflow row unless spec says cascade. Spec: owner-scoped delete of the resource itself. Do not cascade-delete sessions.)
- `DELETE /interviews/{session_id}` → delete `interview_sessions` row.
- `DELETE /resume-analyzer/analyses/{analysis_id}` → delete `resume_analysis` row.

All: `Depends(get_user)` (cheap deletes; rate limit optional), owned load → 404, `delete_where` with **both** id and `user_id`, return `204`. Use `Response(status_code=204)` / `Response` injection — FastAPI must not re-wrap as JSON.

**Tables**: `workflows`, `interview_sessions`, `resume_analysis` (delete only).

**UI**: confirm-delete control on:
- Dashboard prepared packs + interview history rows (`DashboardContent.tsx`)
- Assessment attempts if a delete endpoint exists? Spec lists workflows/interviews/analyses only — **assessment attempts are out of scope for T2** (no `DELETE /assessment/...` in spec). Resume analyzer history list gets delete.
Pattern: button (stopPropagation inside accordion row) → `window.confirm` → `api(path, {method:"DELETE"})` → filter row out of state.

**Files**: `backend/app.py`, `backend/tests/test_deletes.py` (new), `frontend/components/dashboard/DashboardContent.tsx`, `frontend/components/resume/` (history list), `frontend/lib/api.ts` (ensure non-JSON 204 handled — **important**: current `api()` always `res.json()`; must return `undefined`/`null` on 204 before body parse).

**Edge cases**
- `api.ts` 204 handling (contract: `if (res.status === 204) return undefined as T`).
- Foreign id → 404, UI shows humanized error, row remains.
- Accordion open state after row removal (clear `openWorkflow`/`openSession` if id matches).
- Double-click delete → second → 404; UI should ignore already-removed rows.

**QA hooks**: pytest matrix 204/404/foreign-user; screenshot confirm dialog + row removal.

---

### T3 — Report export (Markdown + print)

**Contracts** (pure frontend — no backend change)
- `frontend/lib/download.ts`: keep `downloadJson`; add `downloadMarkdown(filename: string, md: string)` (same blob/anchor pattern, `type: "text/markdown"`).
- MD builders: prefer a small pure helper per report type (e.g. `lib/reportMarkdown.ts`) with functions taking the existing JSON report/session object → string. Pure functions = unit-testable in vitest (T6 synergy).
  - Interview session/report: title, date, verdict, scores table, strengths, improvements, summary.
  - Coaching/practice report: same shape fields as practice result JSON.
  - Prepare pack summary: company/title, match %, strengths/gaps, question list.
- Print: add `@media print` rules in `frontend/app/globals.css` (hide nav/chrome/buttons via a `.print-hide` class or target `header`); report containers get printable layout. Export control: `window.print()` button labeled "Print / PDF".
- Buttons: Export JSON (existing `downloadJson`), Export MD, Print — all three on interview report, practice report, prepare summary.

**Files**: `frontend/lib/download.ts`, new `frontend/lib/reportMarkdown.ts` (or equivalent), report components under `components/interview/`, `components/coaching/`, `components/prepare/`, `app/globals.css`, print buttons.

**Edge cases**
- Missing report fields (fallback report from `_fallback_interview_report`) — MD builder must tolerate missing scores/strengths.
- JSON button regression — keep path untouched except shared 204 concerns (none here).
- Filename safety: slugify ids (`session_id.slice(0,8)` pattern).

**QA hooks**: vitest comparing MD output contains scores/strengths from fixture JSON; print preview screenshot; JSON still downloads.

---

### T4 — Usefulness rating (launch gate)

**Migration** `report_feedback`:
- Columns: `id` (uuid or text pk), `user_id` (text not null), `session_id` (text not null **unique**), `rating` (int check 1–5), `comment` (text null), `created_at` (timestamptz default now()).
- Unique on `session_id` (one rating per session globally; combined with owner check this is safe because only owner can insert).
- RLS: enable; deny anon; authenticated can select/update own (`user_id = auth.uid()`); inserts via service-role from API only (or authenticated insert with check `user_id = auth.uid()` — API path preferred for rate limiting). Follow rate_limit_events style if service-role-only: enable RLS, no policies for anon/authenticated → only service role bypasses.

**Endpoints**
- `POST /feedback` body `{session_id: str, rating: int 1–5, comment?: str null}`.
  - `Depends(rate_limited("feedback", ...))`.
  - Load session (`interview_sessions` or practice report source — **spec: owner-of-session**; practice room reports may share session ids; verify ownership of the referenced session id in the relevant table; if practice reports are session-less, restrict widget to interview sessions + practice sessions that have ids — implementers: confirm practice report carries `session_id`; if not, widget only where an id exists).
  - **Upsert** `dbc.upsert("report_feedback", rows, on_conflict="session_id")` with `user_id` set from caller. Return `{success, data: row}` **200**.
- `GET /feedback/summary` — `Depends(get_user)`; aggregate caller's rows: `{success, data: {average: float|null, count: int}}` (owner average only).

**UI**: star widget (1–5) on **completed** interview report header + practice room report header. Hidden until report visible. After submit: show selected stars (read-only or allow re-rate via upsert). Optimistic or post-await update; on error show inline message.

**Files**: migration SQL, `backend/app.py` (+ maybe `backend/feedback/`), `backend/tests/test_feedback.py`, `frontend/components/interview/` star widget (e.g. `FeedbackStars.tsx`), practice/coaching report header, `frontend/lib/api.ts`.

**Edge cases**
- rating out of range → 422 (Pydantic `Field(ge=1, le=5)`).
- foreign session_id → 404 (do not insert).
- second POST → upsert, row count stays 1 (assert in pytest).
- RLS/service path: cross-user never visible via summary (summary filters `user_id`).
- comment max length (e.g. 1000) via Field constraint.
- Widget once-per-session: load existing rating with report fetch or separate GET (optional `GET /feedback?session_id=` — if omitted, widget allows re-submit upsert; acceptable).

**QA hooks**: pytest create + upsert single-row; cross-user 404; summary average; EvidenceQA screenshots.

---

### T5 — Settings page

**Route**: `/settings` → `AuthGate` + `SettingsPanel`.

**Capabilities** (frontend-heavy; no new backend):
- Change password: Supabase `auth.updateUser({ password })` via `getSupabase()`; validate min length client-side (match AuthForm rules); inline error on failure; success state ("Password updated — use it next sign-in").
- Sign-in methods: read `session.user.user_metadata` / `app_metadata` — email always; Google if `user_metadata.avatar_url` / provider hints or `app_metadata.provider === 'google'`. Display read-only chips.
- Links: `/legal/privacy`, `/legal/terms` (existing routes).
- Sign-out: reuse AuthGate `signOut` logic (extract or duplicate minimal handler: `getSupabase().auth.signOut()` + `router.push("/")`).

**Nav**: Settings in AuthGate desktop `moreNav` + mobile nav when session exists.

**Edge cases**
- No session → AuthGate redirect to sign-in (existing behavior).
- Weak password → inline error, no API call.
- Email verification states: out of scope beyond display.
- Supabase not configured → AuthGate config error already handles.

**Files**: `frontend/app/settings/page.tsx`, `frontend/components/settings/SettingsPanel.tsx` (or `components/auth/`), `frontend/components/auth/AuthGate.tsx`, possibly `frontend/lib/supabase/client.ts` if a helper is needed (avoid unless necessary).

**QA hooks**: manual/E2E-lite: change password → sign out → sign in new password; weak password error; nav visible; signed-out redirect. No new pytest required (frontend-only); cover password form logic in vitest if extracted pure validators.

---

### T6 — Frontend test harness + CI

**Setup**
- Deps: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom` (versions compatible with Next 16 / React in package.json).
- Config: `frontend/vitest.config.ts` (jsdom env, react plugin, path alias `@/` → project root).
- `package.json`: `"test": "vitest run"`.
- Required coverage (spec minimum):
  1. `lib/download.ts`
  2. `lib/api.ts` error humanization + 401 + auth header
  3. `lib/supabase/client.ts` cookie-restore guards (unit, mocked)
  4. One AuthGate or small component smoke test

**CI** (`.github/workflows/ci.yml` frontend job):
```
npm ci → npm run lint → npx tsc --noEmit → npm test → npm run build
```
(Test before build per spec.)

**Edge cases**
- Tests must not hit network: mock `fetch`, mock supabase module.
- jsdom lacks `URL.createObjectURL` — stub in tests.
- CI negative proof: intentionally failing test fails job, then revert (EvidenceQA).

**Files**: `frontend/package.json`, `frontend/vitest.config.ts`, test files under `frontend/lib/**` and `frontend/components/**`, `.github/workflows/ci.yml`.

**QA hooks**: green suite on branch; CI log shows test step; red test demo recorded then reverted.

---

### T7 — Session detail route

**Route**: `/dashboard/session/[id]` → `AuthGate` + `SessionDetailPanel` (client component; `[id]` from `useParams` or server component passing id).

**Data**: `GET /interviews` already returns full rows including `transcript` + `report` for the owner — client can filter by id, **or** add `GET /interviews/{session_id}` (owned `.eq` both keys → 404). Prefer **new GET detail endpoint** if list payloads grow; either is compliant. Decision for implementer: use `GET /interviews/{session_id}` for clean 404 semantics matching redirect rule.

**Behavior (authoritative)**
- Owner + known id → full view: transcript (scrollable), scores, report meta, export JSON + MD (T3 helpers).
- Unknown id **or** foreign id → **`router.replace("/dashboard")`** (redirect; do not show 404).
- Loading state; error that isn't 404 → inline error + back link.
- Dashboard history rows: accordion **kept as preview** + **"Open full session"** link → `/dashboard/session/{session_id}`.

**Files**: `frontend/app/dashboard/session/[id]/page.tsx`, `frontend/components/dashboard/SessionDetailPanel.tsx`, `DashboardContent.tsx` (link), `frontend/lib/api.ts`, `frontend/lib/download.ts` (reuse), `backend/app.py` (detail route if added), `backend/tests/`.

**Edge cases**
- AuthGate unauthenticated → sign-in (existing).
- Session exists but empty report (fallback) → still render transcript + fallback copy.
- Foreign id must not reveal 404 page vs empty — both redirect to `/dashboard`.
- MD/JSON export from detail page uses same builders as T3.

**QA hooks**: deep-link owner loads; foreign id lands on `/dashboard`; export works; screenshots.

---

### T8 — Privacy-safe analytics + gate metrics

**Migration** `product_events`:
- Columns: `id` (pk), `user_id` (text — anonymous id allowed: use auth uid when present, else a client-generated stable anonymous id; **prefer auth uid server-side**, see below), `event_name` (text, constrained to allowlist), `created_at` (timestamptz).
- **No free-text, no resume, no transcript, no PII beyond opaque id.**
- Optional: `session_anon_id` text for logged-out funnel — product is auth-gated post-home; events fire in authed flows mostly. Keep schema minimal: `user_id`, `event_name`, `created_at`.
- RLS: service-role write via API; deny anon/authenticated direct insert (prevent spoofed volume) — or authenticated insert with validation. Prefer **backend write only**.

**Event contract** (client):
- Allowlist: `prepare_started`, `prepare_completed`, `interview_completed`, `feedback_submitted`.
- Payload: `{ event_name }` only + server attaches `user_id` + `created_at`.
- Client helper `frontend/lib/analytics.ts`: `trackEvent(name)` → `api("/analytics/events", {method:"POST", body:{event_name}})` fire-and-forget (`.catch(() => {})`), rate-tolerant. Never send arbitrary strings — TS union type of the four names.

**Endpoints**
- `POST /analytics/events` — auth, body `{event_name: Literal[...]}`, validate allowlist (422 otherwise), insert row. Light rate limit (`analytics` scope).
- `GET /analytics/summary` — auth. Computes for **LAUNCH_READINESS gates**:
  - `prep_completion_pct`: workflows with ≥1 interview session / total workflows (or started→completed definition per gate — document formula in endpoint docstring; use: distinct users or sessions as denominator — **implementation must document the exact denominator** in summary response meta).
  - `interview_completion_pct`: interviews with non-empty report / interviews started (from events or tables).
  - `avg_rating`: from `report_feedback` (global for authenticated operator? Spec: "enough to read LAUNCH_READINESS gates" — summary is authenticated; **scope: metrics over product events + feedback visible to the querying user's org is undefined — default: compute global aggregates via service-role for any authenticated user** (single-tenant beta). Document that this is operator-facing, not multi-tenant safe. If privacy concern: restrict summary to caller's own data — but then gates unreadable. **Decision: global aggregates for any authenticated user** (beta, single operator); note in security checklist as accepted risk / tighten later if multi-tenant.)
- Emission points: prepare form submit start → `prepare_started`; prepare success → `prepare_completed`; interview report received (WS `report` or session persisted) → `feedback_submitted` after T4 POST success.

**Files**: migration, `backend/app.py`, `backend/tests/test_analytics.py`, `frontend/lib/analytics.ts`, prepare/interview/coaching emission sites, `frontend/lib/api.ts`.

**Edge cases**
- Unknown event_name → 422.
- Events must not block UX (fire-and-forget).
- Summary with zero rows → pcts `null` or 0 with count 0 (document; prefer `null` + counts).
- Payload inspection QA: no keys beyond `event_name`.

**QA hooks**: network assertion of events; seeded fixtures → summary math; pytest allowlist + summary formulas; grep payload for free text.

---

### T9 — Spaced-repetition state machine

**Migration** `drill_reviews`:
- `user_id` text not null, `skill` text not null, `interval_index` int not null default 0, `due_at` timestamptz not null, `last_result` text null check in (`again`,`good`), `streak` int not null default 0, `created_at`, `updated_at`.
- **Unique (`user_id`, `skill`)**.
- RLS: user can select own; writes via service-role API (consistent with other tables).

**Backend**
- Replace static schedule in `backend/memory/profile.py`:
  - `get_spaced_repetition_schedule` / `get_due_drills` read `drill_reviews` where `due_at <= now()` ordered by `due_at` asc (most overdue first).
  - New: `ensure_reviews_for_user(user_id)` — seed rows for current weak skills (from `get_weakness_digest`) with `due_at = now()` (due immediately) for skills not yet tracked. Do not re-create deleted rows more than once per weakness generation — simplest: upsert-on-read only when skill missing.
  - `record_review(user_id, skill, result)` → if `good`: `interval_index = min(interval_index+1, len(intervals)-1)`, `due_at = now + INTERVAL[...] days`, `streak += 1`; if `again`: `interval_index = 0`, `due_at = now + 1 day` (spec: "due sooner" / reset to day 1), `streak = 0`. Intervals **`[1, 3, 7, 14]`**.
- Endpoints:
  - `GET /memory/drills` — **rewritten** to return only due items (`due_at <= now`), ordered overdue-first; payload includes `skill`, `due_at`, `interval_index`, `streak`, plus existing drill template (`scenario`, `prompt`, `tip`).
  - `POST /memory/drills/{skill}/review` body `{result: "again"|"good"}` — auth; upsert owned row; return updated review row `{success, data}`. Rate limit optional (`memory` scope).
- `GET /memory/profile` schedule section: derive from same due query (consistency).

**Frontend**
- Dashboard drill cards: show server `due_at` / overdue label; actions **Complete** (`good`) and **Again** (`again`) call review endpoint then refresh drills (bump `reloadKey` or refetch). Keep "Practice this" handoff (localStorage) as optional secondary — actions must not rely on localStorage for schedule truth.
- Complete → card disappears from due list (until next due).
- Again → remains due sooner (1 day) — disappears from due list until tomorrow per spec ("again → due sooner"); if already due, re-review allowed (posting again refreshes due_at).

**Files**: migration, `backend/memory/profile.py`, `backend/app.py`, `backend/tests/test_drills.py`, `DashboardContent.tsx`, `frontend/lib/api.ts`.

**Edge cases**
- Unknown skill in POST → create row at interval 0? Or 404 — **decision: upsert new row with review applied** (idempotent UX) vs 404: prefer **404 if skill never seeded** to avoid garbage rows; seed path creates known skills. Implementer: 404 for unknown skill not in user's weakness set OR allow upsert — **authoritative: upsert allowed only if skill exists in user's drill_reviews or weakness digest; else 404.**
- Second user isolation: all queries `.eq("user_id")`.
- Clock: store UTC timestamptz; due compare in SQL or Python aware-UTC.
- `memory.profile` never raises — keep 503 at route boundary.

**QA hooks**: pytest advance/reset/due ordering/isolation; UI due card lifecycle screenshots.

---

### T10 — Visual polish pass

**Scope**: fixes only within `docs/DESIGN_CONTRACT.md`. No brand rewrite, no new palette, no new illustration style.

**Review routes**: `/`, `/prepare`, `/interview`, `/dashboard`, `/coaching`, `/settings` (+ `/knowledge`, `/dashboard/session/[id]` if landed by then).

**Checklist per route**
- Hierarchy: one H1, clear primary action (cobalt).
- Spacing rhythm: section gaps consistent; cards not cramped (p-4/p-6).
- Contrast: muted text on card/background meets WCAG AA (spot-check; fix `text-muted-foreground` on low-contrast fills).
- Radii: 14–16px (`rounded-2xl`) for grouping surfaces; avoid mixed radii on sibling controls.
- Empty / loading / error states present and styled (not bare text).
- Mobile: nav overflow, grids collapse, tap targets ≥40px.
- Motion: transitions 160–200ms; reduced-motion keeps state feedback (no positional animation only).
- Kill AI-template tells: stock gradients (none allowed anyway), numbered section labels, decorative grids, inconsistent shadows.

**Files**: `frontend/app/globals.css`, `frontend/tailwind.config.ts` (if tokens), page/panel components listed above, `components/ui/*` shared primitives. **Do not rewrite `docs/DESIGN_CONTRACT.md`.**

**QA hooks**: before/after screenshots per route light+dark; axe or manual contrast spot-check; reduced-motion verification.

---

### T11 — AI interview intensity control

**Enum**: `easy | standard | hard`. Default **`standard`**.

**Persistence**
- Column `intensity` text not null default `'standard'` with check constraint on `interview_sessions` (and/or `workflows` if chosen at prepare). Spec: "stored on workflow/session" — **store on both when known**: workflow create/start accepts intensity; `POST /interviews/start` accepts `intensity` and copies to session; if column on sessions only, workflow can hold it transiently in request. Minimal: **`interview_sessions.intensity`** + request field on start; prepare UI choice flows into start payload. Add `workflows.intensity` if prepare must remember across page loads — migration includes both if needed; default standard keeps old rows valid.

**API**
- `InterviewStart` model: `intensity: Literal["easy","standard","hard"] = "standard"`.
- Persist on session create (registry state + final `interview_sessions` insert).
- WS: pass intensity through query params **or** prefer session state (already in registry from start) — **prefer registry state** over URL to avoid log leakage (consistent with ws_token philosophy).

**Prompt injection**
- `build_interviewer_system(..., intensity: str = "standard")` appends/modulates instructions:
  - `easy`: warmer tone, lighter probing, encouraging follow-ups, gentler scoring rubric wording.
  - `standard`: **exactly current prompt** (golden test).
  - `hard`: deeper probes, harsher follow-up challenges, stricter scoring bar.
- Same model/provider chain — no new providers.
- Judge report may also receive intensity for scoring strictness (optional but spec mentions scoring strictness — apply to judge prompt with same golden default).

**UI**
- Intensity selector on Prepare (and/or Interview start): segmented control (3 chips), default Standard selected.
- During interview: chip showing current intensity (read-only display from session start response).
- Persists across WS turns (server-side prompt built once at connect — no client prompt drift).

**Files**: migration (columns), `backend/app.py` (`InterviewStart`), `backend/agents/interviewer.py` (prompt builder signature), `backend/workflow/preparation.py` (if workflow stores it), `backend/tests/` (unit: prompt differs; golden: standard == current), `frontend/app/prepare/`, `frontend/app/interview/`, `components/prepare/PreparePanel.tsx`, `components/interview/InterviewPanel.tsx`.

**Edge cases**
- Old sessions without column → migration default `standard`.
- Invalid enum → 422.
- Golden regression: capture current `build_interviewer_system` output before refactor; test locks it for `standard`.
- WS reconnect rebuilds prompt from session state intensity.

**QA hooks**: pytest accepts+stores intensity; prompt diff test; golden standard test; UI toggle + chip screenshot; WS turn stability.

---

## 4. Security non-regression checklist

Run before each task's EvidenceQA and again at pipeline end.

| Control | Check |
|---|---|
| **CSP / security headers** | Backend middleware unchanged (`app.py` `_security_headers`); live `curl -I` on API still shows CSP `frame-ancestors 'none'; default-src 'none'`, nosniff, DENY, HSTS, COOP. Frontend next.config security headers untouched unless additive. |
| **Rate limits** | New mutating endpoints have `rate_limited` or documented `get_user`-only rationale; limiter key namespaced; 429 includes `Retry-After`. |
| **RLS / ownership** | Every new table: RLS enabled; service-role queries always `.eq("user_id", uid)` or `_load_owned`; foreign id → 404; no list endpoint omits user filter. |
| **No localStorage tokens** | No `localStorage.setItem` for access_token/refresh_token. Drill handoff JSON payload (scenario/prompt) is OK — not a credential. Cookie restore path unchanged. |
| **WS token** | Still body-first auth frame, not query string; single-use; TTL. T11 must not put secrets in WS URL (intensity enum in registry state). |
| **Analytics privacy** | `product_events` payload allowlist only; no resume/transcript/comment free text; QA greps event body. |
| **Feedback data** | `comment` length-capped; not rendered as HTML (React escapes — no `dangerouslySetInnerHTML`). |
| **Auth headers** | All new `api()` calls go through existing `authHeaders()`; no manual token handling. |
| **CORS** | No wildcard origins added. |
| **Dependencies** | No new backend deps without `requirements.txt` + pip-audit green; frontend test deps are devDependencies only. |
| **Summary endpoint** | Documented global-aggregate scope (accepted for single-tenant beta); revisit before multi-user GA. |

---

## 5. Suggested implementation order (matches tasklist)

Pipeline order from spec — implementers execute in this sequence; each lands with its tests:

1. **T6** — Vitest harness + CI wiring (so T1–T5, T7–T9 tests land in harness).
2. **T1** — Knowledge workspace (API + `/knowledge` UI).
3. **T2** — Content deletion (API + UI; fix `api.ts` 204 first).
4. **T3** — Markdown + print export (pure frontend; enables T7 reuse).
5. **T4** — Feedback migration + upsert POST + summary GET + star widget.
6. **T7** — Session detail route + dashboard deep link (uses T3 exports).
7. **T9** — `drill_reviews` migration + state machine + dashboard actions.
8. **T5** — Settings page + AuthGate nav.
9. **T8** — `product_events` + analytics helper + summary endpoint (after T4 for `feedback_submitted`).
10. **T11** — Intensity control (prompt golden tests last-mile before polish).
11. **T10** — Visual polish pass over all routes including new ones.

**Parallelization note** (if multiple agents): T6 first always. T1/T2/T3 backend-vs-frontend can split after contracts frozen. T5 is isolated. T10 strictly last. T4 and T9 both create migrations — sequence timestamps to avoid collisions. T7 depends on T3 helpers; T8 depends on T4 event name.

**Definition of done** (from spec): all tasklist boxes `[x]`; EvidenceQA PASS ≤3 retries; `testing-reality-checker` integration PASS; pytest green; frontend `lint`/`tsc`/`test`/`build` green; PR to main + CI green (merge after user go-ahead).

---

## 6. Blockers / open questions

None blocking. Non-blocking notes for implementers:

1. **Practice report session_id**: confirm practice room reports persist a `session_id` usable by T4 ownership check; if not, limit star widget to interview sessions (spec primary) and add practice ids only if already present.
2. **T8 summary scope**: global aggregates for any authenticated user (single-tenant beta) — accepted; flag if multi-tenant is introduced.
3. **T2 cascade**: workflow delete does not cascade interview sessions (sessions remain for history) — reversible if product owner prefers cascade.
4. **CI path**: `.github/workflows/ci.yml` exists at repo root (confirmed); T6 edits frontend job only.
