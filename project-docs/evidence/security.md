# EvidenceQA — Security non-regression

Run: 2026-09-25. Checks against architecture §4 security checklist.

## persistSession: false — CONFIRMED

| Location | Value |
|---|---|
| `frontend/lib/supabase/client.ts:64` | `persistSession: false` (browser client; access token memory-only) |
| `frontend/app/api/auth/session/route.ts:13` | `persistSession: false, autoRefreshToken: false, detectSessionInUrl: false` (server client) |

Cross-load restore path: httpOnly cookie `hustlrzz_rt` via `GET/POST/DELETE /api/auth/session` (`route.ts:5-28`), never JS-readable.

## CSP origin list — CONFIRMED (`frontend/next.config.mjs`)

- `default-src 'self'`
- `script-src`: `'self'`, `'unsafe-inline'`, `'wasm-unsafe-eval'`, `https://cdn.jsdelivr.net`
- `style-src`: `'self'`, `'unsafe-inline'`
- `img-src`: `'self'`, `data:`, `blob:`
- `font-src`: `'self'`, `data:`
- `connect-src`: `'self'`, `https://*.supabase.co`, `wss://*.supabase.co`, `https://*.onrender.com`, `wss://*.onrender.com`, optional `NEXT_PUBLIC_API_URL` origin, dev-only `http://localhost:8000` + `ws://localhost:8000`
- `worker-src`: `'self'`, `blob:`; `child-src blob:`; `media-src 'self' blob:`
- `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`
- Plus: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP, HSTS preload

Backend `_security_headers` (`backend/app.py:79-88`): `Content-Security-Policy: frame-ancestors 'none'; default-src 'none'`.

No blanket `https:` / `unsafe-eval`. No wildcard CORS origins added.

## No localStorage tokens — CONFIRMED

`localStorage.setItem` hits in app code (grep, excluding node_modules):

| Key | File | Content |
|---|---|---|
| `hustlrzz-theme` | `components/theme/ThemeProvider.tsx:48`, `app/layout.tsx:37` | theme preference string |
| `hustlrzz-drill-v1` | `components/dashboard/DashboardContent.tsx:195` | drill handoff JSON (scenario/prompt — not a credential) |
| practice history | `components/coaching/PracticeRoom.tsx:195` | attempt history JSON |

No `access_token` / `refresh_token` / `sb-*-auth-token` writes. `client.ts:12-21` actively **purges** legacy `sb-*-auth-token` keys on boot.

## Feedback ownership — CONFIRMED

- `POST /coaching/practice` issues a cryptographically random `practice-*` session id and writes the authenticated `user_id` to `practice_sessions` (`backend/app.py:663-670`).
- `POST /feedback` resolves only server-issued interview or practice sessions and requires `row.user_id == caller.uid`; missing and foreign ids return 404 (`backend/app.py:906-911`).
- Abuse tests cover unissued practice ids, foreign practice ids, and server issuance (`backend/tests/test_feedback.py:133-165`).
- RLS-only migration `20260925123000_practice_feedback_sessions.sql` was applied to the linked remote database and verified in `supabase migration list`.
- Fresh installs receive the same ownership table plus Phase 2 feedback, analytics, drill, and intensity schema through `supabase/schema.sql:33-95`.

## Service-worker freshness — CONFIRMED

- Cache version bumped to `hustlrzz-v2`, forcing existing clients to discard the prior cache.
- Navigations and Next RSC data use network-first with cached offline fallback; hashed/static assets remain cache-first (`frontend/public/sw.js:1-43`).
- This prevents duplicate pre-fix headers and stale client navigation data from surviving a deployment.

## rate_limited endpoints — CONFIRMED

`rate_limited(scope, limit, window)` (`backend/app.py:105-124`) binds to `user["uid"]`, raises **429** with `Retry-After` header.

| Method + path | Scope | Limit constant | Line |
|---|---|---|---|
| `POST /memory/drills/{skill}/review` | `drill_review` | `RATE_DRILL_REVIEW_PER_MIN` (30) | 1128 |
| `DELETE /workflows/{workflow_id}` | `delete` | `RATE_DELETE_PER_MIN` (20) | 169 |
| `DELETE /interviews/{session_id}` | `delete` | `RATE_DELETE_PER_MIN` (20) | 204 |
| `DELETE /resume-analyzer/analyses/{analysis_id}` | `delete` | `RATE_DELETE_PER_MIN` (20) | 486 |
| `POST /workflows/start`, `/workflows/upload` | `workflows` | `RATE_WORKFLOWS_PER_MIN` (6) | 244, 356 |
| `POST /knowledge/documents`, `/knowledge/search`, `DELETE /knowledge/documents/{id}` | `knowledge` | `RATE_KNOWLEDGE_PER_MIN` (10) | 837, 853, 871 |
| `POST /feedback` | `feedback` | `RATE_FEEDBACK_PER_MIN` (10) | 916 |
| `POST /analytics/events` | `analytics` | `RATE_ANALYTICS_PER_MIN` (30) | 983 |
| `POST /interviews/start` | `interview` | `RATE_INTERVIEW_STARTS_PER_MIN` (8) | 1181 |
| coaching / resume / assessment / intel routes | various | see `backend/config.py:66-74` | — |

Config constants: `backend/config.py:66-74` (`RATE_DRILL_REVIEW_PER_MIN` line 73, `RATE_DELETE_PER_MIN` line 74).

429 tests asserting `Retry-After`: `test_deletes.py:164`, `test_feedback.py:166`, `test_analytics.py:141` — all in the green 190-pass suite.

## Other checklist items

- **RLS / ownership**: deletes use `_delete_owned_or_404` with `.eq("user_id")` filter; foreign id → 404.
- **WS token**: body-first auth frame unchanged (no intensity/secrets in WS URL).
- **Analytics privacy**: `product_events` props free-text rejected (`test_analytics.py:107`).
- **Auth headers**: frontend uses shared `authHeaders()`; no manual token handling.
