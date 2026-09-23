# Hustlrzz Phase 2 — Tasklist

**Spec**: `project-specs/hustlrzz-phase2-setup.md` (authoritative)
**Repo**: `/Users/dgsmacbook/hustlrzz` (branch from current `main` @ security-hardened `97fb285`)
**Scope**: 11 tasks. Billing/payments **excluded** by owner decision (spec: "Payment / billing / subscriptions (explicitly excluded by product owner)").

---

### [x] T1 — Knowledge base workspace
**Spec requirements:**
- "Page `/knowledge` (auth-gated): status banner, own document list, search box, per-document delete."
- "Backend: `GET /knowledge/documents` (list own), `DELETE /knowledge/documents/{document_id}` (owner-only; call existing `rag` delete)."
- "Ingest remains Prepare side-effect; this page is manage/search/delete only."

**Acceptance / QA evidence:**
- "status loads; list shows docs after prepare upload; delete removes from list + `GET` no longer returns; search returns source-labelled chunks; other user's id → 404."

**Files likely touched:**
- `frontend/app/knowledge/page.tsx` (new)
- `frontend/components/` (knowledge panel component)
- `frontend/lib/api.ts`
- `backend/app.py` (or knowledge router), `backend/rag/service.py`
- `frontend/components/auth/AuthGate.tsx` (nav, if applicable)

---

### [x] T2 — Content deletion (API + UI)
**Spec requirements:**
- "`DELETE /workflows/{workflow_id}`, `DELETE /interviews/{session_id}`, `DELETE /resume-analyzer/analyses/{analysis_id}` — owner-scoped, 204 on success, 404 otherwise."
- "Dashboard / assessment lists: confirm-delete control (native confirm or simple dialog); row disappears after success."

**Acceptance / QA evidence:**
- "pytest for 204/404/ownership; UI screenshot of confirm + row removal."

**Files likely touched:**
- `backend/app.py`, `backend/workflow/`, `backend/assessment/service.py`, `backend/resume/`
- `backend/tests/` (new delete tests)
- `frontend/components/dashboard/DashboardContent.tsx`
- `frontend/components/assessment/`, `frontend/components/resume/`
- `frontend/lib/api.ts`

---

### [x] T3 — Report export (Markdown + print)
**Spec requirements:**
- "Keep existing JSON download."
- "Add Markdown export (client-built `.md`) for: interview report, coaching/practice report, prepare pack summary."
- "Print stylesheet / `window.print()` path for report layout (readable PDF via browser print)."

**Acceptance / QA evidence:**
- "`.md` file content matches scores/strengths/improvements from JSON; print preview screenshot; JSON button still works."

**Files likely touched:**
- `frontend/lib/download.ts`
- `frontend/app/globals.css` (print stylesheet)
- report components under `frontend/components/interview/`, `frontend/components/coaching/`, `frontend/app/prepare/`, `frontend/app/interview/`, `frontend/app/coaching/`

---

### [x] T4 — Usefulness rating (launch gate)
**Spec requirements:**
- "Migration: `report_feedback` (`id`, `user_id`, `session_id` unique, `rating` 1–5 check, `comment` text null, `created_at`)."
- "`POST /feedback` `{session_id, rating, comment?}` — auth + owner-of-session; second POST same session → upsert or 409 (pick one; document it)."
- "Star widget on completed interview report + practice room report headers; hide until report visible; once per session."
- "Optional: `GET /feedback/summary` average for owner (not admin dashboard)."

**Acceptance / QA evidence:**
- "POST creates row; duplicate behavior as specified; widget hidden pre-report; RLS/service path blocks cross-user."

**Files likely touched:**
- `supabase/migrations/` (new `report_feedback` migration)
- `backend/app.py` (feedback endpoints), `backend/tests/`
- `frontend/components/interview/` (star widget), practice/coaching report headers
- `frontend/lib/api.ts`

---

### [x] T5 — Settings page
**Spec requirements:**
- "Route `/settings` (auth-gated): change password (Supabase `auth.updateUser`), show sign-in methods (email / Google from user metadata), links to `/legal/privacy` + `/legal/terms`, sign-out."
- "Nav entry “Settings” in `AuthGate` (desktop + mobile) when session exists."

**Acceptance / QA evidence:**
- "successful password change → can sign in with new password; invalid/weak password inline error; nav shows Settings; signed-out user redirected to sign-in."

**Files likely touched:**
- `frontend/app/settings/page.tsx` (new)
- `frontend/components/auth/AuthGate.tsx`
- `frontend/lib/supabase/client.ts`
- `frontend/app/legal/` (existing links)

---

### [x] T6 — Frontend test harness + CI
**Spec requirements:**
- "Vitest + React Testing Library; `npm test` script."
- "Cover at least: `lib/download.ts`, `lib/api.ts` error humanization, `lib/supabase/client.ts` cookie-restore guards (unit), one AuthGate or small component smoke."
- "Wire `npm test` into `.github/workflows/ci.yml` frontend job **before** build."

**Acceptance / QA evidence:**
- "CI job runs tests; intentional failing test fails CI (then revert); green suite on branch."

**Files likely touched:**
- `frontend/package.json` (`test` script + devDeps)
- `frontend/` (vitest config, test files for `lib/download.ts`, `lib/api.ts`, `lib/supabase/client.ts`, `components/auth/AuthGate.tsx`)
- `.github/workflows/ci.yml`

---

### [x] T7 — Session detail route
**Spec requirements:**
- "`/dashboard/session/[id]`: full transcript, scores, report meta, export (JSON + MD from T3)."
- "Dashboard history rows link here; accordion may remain as preview or be replaced — deep link must work."
- "Owner-only; unknown/foreign id → redirect `/dashboard` or 404 (pick one; document)."

**Acceptance / QA evidence:**
- "deep-link loads for owner; foreign id handled; export works on detail page; screenshot."

**Files likely touched:**
- `frontend/app/dashboard/session/[id]/page.tsx` (new)
- `frontend/components/dashboard/DashboardContent.tsx`
- `frontend/lib/api.ts`, `frontend/lib/download.ts`

---

### [x] T8 — Privacy-safe analytics + gate metrics
**Spec requirements:**
- "Client events (no resume/transcript/free text): `prepare_started`, `prepare_completed`, `interview_completed`, `feedback_submitted` with anonymous user id + timestamps only."
- "Backend table or Supabase table `product_events` + `GET /analytics/summary` (auth) computing: prep completion %, interview completion %, avg rating — enough to read LAUNCH_READINESS gates."

**Acceptance / QA evidence:**
- "events fire on funnel steps (network assertion); summary matches seeded fixtures; payload inspection shows no free-text fields."

**Files likely touched:**
- `frontend/lib/analytics.ts`
- `frontend/app/prepare/`, `frontend/app/interview/` (event emission points)
- `supabase/migrations/` (new `product_events` migration)
- `backend/app.py` (`/analytics/summary`), `backend/tests/`

---

### [x] T9 — Spaced-repetition state machine
**Spec requirements:**
- "Replace fixed `[1,3,7]` static schedule in `backend/memory/profile.py` with persisted review state."
- "Migration: `drill_reviews` (`user_id`, `skill`, `interval_index`, `due_at`, `last_result`, `streak`, timestamps); unique `(user_id, skill)`."
- "API: `GET /memory/drills` returns only **due** items (due_at ≤ now), ordered by overdue; `POST /memory/drills/{skill}/review` with `{result: again|good}` → advance interval `[1,3,7,14]` or reset to day 1 on `again`."
- "Dashboard drill cards: Complete / Again actions (not only localStorage handoff); schedule uses server due dates."

**Acceptance / QA evidence:**
- "pytest for advance/reset/due logic; UI shows due drill; complete → disappears until due; again → due sooner; second user isolated."

**Files likely touched:**
- `backend/memory/profile.py`
- `supabase/migrations/` (new `drill_reviews` migration)
- `backend/app.py` (drill endpoints), `backend/tests/`
- `frontend/components/dashboard/DashboardContent.tsx` (drill cards)
- `frontend/lib/api.ts`

---

### [x] T10 — Visual polish pass (within design contract)
**Spec requirements:**
- "Full visual review of key routes (`/`, `/prepare`, `/interview`, `/dashboard`, `/coaching`, `/settings` after T5): hierarchy, spacing, contrast (WCAG AA), empty/loading/error states, mobile breakpoints."
- "Fixes only — no brand rewrite: cobalt identity, grotesk type, motion 160–200ms per `docs/DESIGN_CONTRACT.md`."
- "Kill generic AI-template look where found (inconsistent radii, cramped cards, low-contrast muted text)."

**Acceptance / QA evidence:**
- "before/after screenshots per route (light + dark), axe/manual contrast spot-check, reduced-motion still shows state feedback."

**Files likely touched:**
- `frontend/app/globals.css`, `frontend/tailwind.config.ts`
- `frontend/app/page.tsx`, `frontend/app/prepare/`, `frontend/app/interview/`, `frontend/app/coaching/`, settings page (from T5)
- `frontend/components/ui/`, `frontend/components/theme/`
- `docs/DESIGN_CONTRACT.md` (reference only — no rewrite)

---

### [x] T11 — AI interview intensity control
**Spec requirements:**
- "User chooses intensity: `easy` | `standard` | `hard` on Prepare/Interview start."
- "Backend: intensity stored on workflow/session; injected into interviewer system prompt (probe depth, follow-up harshness, scoring strictness) — **no new model/provider**."
- "Default `standard` = current behaviour (no prompt regression)."
- "Persist choice on session; show selected chip during interview."

**Acceptance / QA evidence:**
- "API accepts intensity; session record stores it; prompt differs per level in unit test; UI toggles + persists across WS turns; default path matches old prompts in golden test."

**Files likely touched:**
- `backend/agents/`, `backend/ai/` (interviewer prompt assembly)
- `backend/workflow/preparation.py`, `backend/app.py` (session/workflow create + WS)
- `backend/tests/` (unit + golden prompt tests)
- `supabase/migrations/` (if session/workflow column added)
- `frontend/app/prepare/`, `frontend/app/interview/`, `frontend/components/prepare/`, `frontend/components/interview/`

---

## Pipeline order (per spec)

1. **T6** — test harness first (so later tasks land with tests)
2. **T1, T2, T3**
3. **T4, T7, T9**
4. **T5, T8, T11**
5. **T10** — visual polish after features land

## Definition of done (pipeline) — from spec

- [ ] Every task `[x]` in `project-tasks/hustlrzz-phase2-tasklist.md` (T1–T11)
- [ ] Each task: EvidenceQA **PASS** (screenshot + command output) with ≤3 retries
- [ ] Final: `testing-reality-checker` integration PASS (defaults NEEDS WORK without evidence)
- [ ] `backend/.venv/bin/python -m pytest backend/tests/ -q` green
- [ ] Frontend: `lint`, `tsc`, `test`, `build` green
- [ ] PR to `main` + CI green (merge only after user go-ahead)

## Out of scope (spec)

- Payment / billing / subscriptions (explicitly excluded by product owner)
- Mobile native apps (separate platform project — not this web pipeline)
- Provider/model swap (stay on existing Groq/Gemini/OpenAI chain)

## Security non-regression (spec stack constraints)

- "Security (already shipped — must not regress): CSP headers, no localStorage tokens, rate limits, RLS."
