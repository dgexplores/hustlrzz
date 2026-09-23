# Hustlrzz Phase 2 — Setup Spec

**Project**: hustlrzz-phase2  
**Repo**: `/Users/dgsmacbook/hustlrzz` (branch from current `main` @ security-hardened `97fb285`)  
**Live**: frontend https://hustlrzz.vercel.app · API https://hustlrzz-api.onrender.com  
**Date**: 2026-09-23

## Problem

Phase 1 shipped a complete prepare → practice → improve loop plus security hardening. Gaps that block a monitored beta and LAUNCH_READINESS gates:

- No settings/account surface
- Knowledge base (RAG) has API but zero UI; no document delete
- No deletion of user content (workflows/sessions/analyses)
- Reports only export raw JSON (no Markdown/print)
- Usefulness rating gate (≥4/5) has no collection UI/API
- No frontend tests (CI is lint+tsc+build only)
- History is accordion-only; no shareable session detail URL
- No privacy-safe funnel analytics for rollout gates
- Spaced repetition is static `[1,3,7]` with no review state
- Visual inconsistencies vs design contract on secondary screens
- Interview intensity is fixed (one interviewer hardness)

## Problem note
Billing/payments remain **excluded** by owner decision. Mobile native remains a separate initiative.

## Goals (exact scope)

Ship an 11-task pipeline. Each task independently demoable and QA-testable.

### T1 — Knowledge base workspace
- Page `/knowledge` (auth-gated): status banner, own document list, search box, per-document delete.
- Backend: `GET /knowledge/documents` (list own), `DELETE /knowledge/documents/{document_id}` (owner-only; call existing `rag` delete).
- Ingest remains Prepare side-effect; this page is manage/search/delete only.
- **QA evidence**: status loads; list shows docs after prepare upload; delete removes from list + `GET` no longer returns; search returns source-labelled chunks; other user’s id → 404.

### T2 — Content deletion (API + UI)
- `DELETE /workflows/{workflow_id}`, `DELETE /interviews/{session_id}`, `DELETE /resume-analyzer/analyses/{analysis_id}` — owner-scoped, 204 on success, 404 otherwise.
- Dashboard / assessment lists: confirm-delete control (native confirm or simple dialog); row disappears after success.
- **QA evidence**: pytest for 204/404/ownership; UI screenshot of confirm + row removal.

### T3 — Report export (Markdown + print)
- Keep existing JSON download.
- Add Markdown export (client-built `.md`) for: interview report, coaching/practice report, prepare pack summary.
- Print stylesheet / `window.print()` path for report layout (readable PDF via browser print).
- **QA evidence**: `.md` file content matches scores/strengths/improvements from JSON; print preview screenshot; JSON button still works.

### T4 — Usefulness rating (launch gate)
- Migration: `report_feedback` (`id`, `user_id`, `session_id` unique, `rating` 1–5 check, `comment` text null, `created_at`).
- `POST /feedback` `{session_id, rating, comment?}` — auth + owner-of-session; second POST same session → upsert or 409 (pick one; document it).
- Star widget on completed interview report + practice room report headers; hide until report visible; once per session.
- Optional: `GET /feedback/summary` average for owner (not admin dashboard).
- **QA evidence**: POST creates row; duplicate behavior as specified; widget hidden pre-report; RLS/service path blocks cross-user.

### T5 — Settings page
- Route `/settings` (auth-gated): change password (Supabase `auth.updateUser`), show sign-in methods (email / Google from user metadata), links to `/legal/privacy` + `/legal/terms`, sign-out.
- Nav entry “Settings” in `AuthGate` (desktop + mobile) when session exists.
- **QA evidence**: successful password change → can sign in with new password; invalid/weak password inline error; nav shows Settings; signed-out user redirected to sign-in.

### T6 — Frontend test harness + CI
- Vitest + React Testing Library; `npm test` script.
- Cover at least: `lib/download.ts`, `lib/api.ts` error humanization, `lib/supabase/client.ts` cookie-restore guards (unit), one AuthGate or small component smoke.
- Wire `npm test` into `.github/workflows/ci.yml` frontend job **before** build.
- **QA evidence**: CI job runs tests; intentional failing test fails CI (then revert); green suite on branch.

### T7 — Session detail route
- `/dashboard/session/[id]`: full transcript, scores, report meta, export (JSON + MD from T3).
- Dashboard history rows link here; accordion may remain as preview or be replaced — deep link must work.
- Owner-only; unknown/foreign id → redirect `/dashboard` or 404 (pick one; document).
- **QA evidence**: deep-link loads for owner; foreign id handled; export works on detail page; screenshot.

### T8 — Privacy-safe analytics + gate metrics
- Client events (no resume/transcript/free text): `prepare_started`, `prepare_completed`, `interview_completed`, `feedback_submitted` with anonymous user id + timestamps only.
- Backend table or Supabase table `product_events` + `GET /analytics/summary` (auth) computing: prep completion %, interview completion %, avg rating — enough to read LAUNCH_READINESS gates.
- **QA evidence**: events fire on funnel steps (network assertion); summary matches seeded fixtures; payload inspection shows no free-text fields.

### T9 — Spaced-repetition state machine
- Replace fixed `[1,3,7]` static schedule in `backend/memory/profile.py` with persisted review state.
- Migration: `drill_reviews` (`user_id`, `skill`, `interval_index`, `due_at`, `last_result`, `streak`, timestamps); unique `(user_id, skill)`.
- API: `GET /memory/drills` returns only **due** items (due_at ≤ now), ordered by overdue; `POST /memory/drills/{skill}/review` with `{result: again|good}` → advance interval `[1,3,7,14]` or reset to day 1 on `again`.
- Dashboard drill cards: Complete / Again actions (not only localStorage handoff); schedule uses server due dates.
- **QA evidence**: pytest for advance/reset/due logic; UI shows due drill; complete → disappears until due; again → due sooner; second user isolated.

### T10 — Visual polish pass (within design contract)
- Full visual review of key routes (`/`, `/prepare`, `/interview`, `/dashboard`, `/coaching`, `/settings` after T5): hierarchy, spacing, contrast (WCAG AA), empty/loading/error states, mobile breakpoints.
- Fixes only — no brand rewrite: cobalt identity, grotesk type, motion 160–200ms per `docs/DESIGN_CONTRACT.md`.
- Kill generic AI-template look where found (inconsistent radii, cramped cards, low-contrast muted text).
- **QA evidence**: before/after screenshots per route (light + dark), axe/manual contrast spot-check, reduced-motion still shows state feedback.

### T11 — AI interview intensity control
- User chooses intensity: `easy` | `standard` | `hard` on Prepare/Interview start.
- Backend: intensity stored on workflow/session; injected into interviewer system prompt (probe depth, follow-up harshness, scoring strictness) — **no new model/provider**.
- Default `standard` = current behaviour (no prompt regression).
- Persist choice on session; show selected chip during interview.
- **QA evidence**: API accepts intensity; session record stores it; prompt differs per level in unit test; UI toggles + persists across WS turns; default path matches old prompts in golden test.

## Explicitly out of scope
- Payment / billing / subscriptions (explicitly excluded by product owner)
- Mobile native apps (separate platform project — not this web pipeline)
- Provider/model swap (stay on existing Groq/Gemini/OpenAI chain)

## Stack constraints (existing only)
- Frontend: Next.js 16 App Router, TypeScript, Tailwind — match existing patterns (`AuthGate`, `api.ts`, panels).
- Backend: FastAPI + existing `rate_limited`, owner `_load_owned` / `.eq("user_id")` patterns; tests with pytest.
- DB: Supabase migrations under `supabase/migrations/` (idempotent where possible); service-role backend.
- Security (already shipped — must not regress): CSP headers, no localStorage tokens, rate limits, RLS.

## Definition of done (pipeline)
- Every task `[x]` in `project-tasks/hustlrzz-phase2-tasklist.md` (T1–T11)
- Each task: EvidenceQA **PASS** (screenshot + command output) with ≤3 retries
- Final: `testing-reality-checker` integration PASS (defaults NEEDS WORK without evidence)
- `backend/.venv/bin/python -m pytest backend/tests/ -q` green
- Frontend: `lint`, `tsc`, `test`, `build` green
- PR to `main` + CI green (merge only after user go-ahead)

## Priority / pipeline order
1. **T6** (test harness first — so later tasks land with tests)  
2. **T1, T2, T3**  
3. **T4, T7, T9**  
4. **T5, T8, T11**  
5. **T10** (visual polish after features land)

## Success criteria
- Beta operator can delete content, manage knowledge, export reports, rate usefulness, change password
- Drills follow real due dates with complete/again
- Interview intensity selectable; default unchanged
- Key routes meet design contract + AA contrast (screenshots)
- CI blocks regressions on frontend
- Launch gates measurable from summary endpoint
- Live deploy still passes security header checks
