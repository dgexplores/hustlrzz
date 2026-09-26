# EvidenceQA — Task status T1–T11

Run: 2026-09-25. Current suite counts: **pytest 190 passed**, **vitest 84 passed (12 files)**, tsc 0, lint 0, build 0.

| Task | Status | QA note (EvidenceQA PASS) | Key evidence |
|---|---|---|---|
| **T6** Frontend test harness + CI | PASS | Vitest + RTL harness live; `npm test` green; suite covers download/api/client/AuthGate smoke per spec | `vitest` 12 files / **84 tests**; `frontend/package.json` `test` script |
| **T1** Knowledge workspace | PASS | Owner-scoped list/delete pytest green (`test_knowledge_workspace.py` 5 tests); list 204/404/foreign isolation | pytest count at T1 QA: 125→; file tests start ~L73; final suite **187** |
| **T2** Content deletion (API + UI) | PASS | `test_deletes.py` **14 tests**: 204 owner / 404 foreign / missing / twice / no-cascade + rate-limit 429 | pytest at T2: **138**; rate-limit test L164–172 asserts 429 + `Retry-After` |
| **T3** Report export (MD + print) | PASS | Markdown export + print path; FE unit coverage | FE count at T3: **43FE**; final FE **84** |
| **T4** Usefulness rating | LOCAL PASS | `test_feedback.py` **16 tests**: server-issued practice ownership, unissued/foreign 404, create/upsert/range/rate-limit/summary | migration `20260925123000` applied remotely; production deploy pending |
| **T7** Session detail route | PASS | `test_session_detail.py` **5 tests**: owner full row / foreign 404 / unknown 404 / auth / list still scoped; route `ƒ /dashboard/session/[id]` in build | pytest at T7: **156** |
| **T9** Spaced-repetition drills | PASS | `test_drills.py` **11 tests**: due filter/order, good ladder→14d cap, again reset, owner isolation, 404/422/auth; `POST …/review` rate-limited | pytest at T9: **167**; endpoint `app.py:1124-1128` |
| **T5** Settings page | PASS | Settings FE tests green; `/settings` route in build; nav/auth redirects covered by AuthGate tests | FE count at T5: **57FE→**; final FE **84** |
| **T8** Analytics + gate metrics | PASS | `test_analytics.py` **13 tests**: event allowlist, free-text rejection, props stripping, auth, rate-limit, summary math | pytest at T8: **180**; rate-limit test L141 |
| **T11** Interview intensity | PASS | `test_interview_intensity.py` **5 tests**: golden standard prompt, prompts differ per level, default persists, 422 invalid, stored+prompted | pytest **186→187** (T11 landed final tests) |
| **T10** Visual polish | NEEDS WORK | Single-header light/dark/mobile shots captured; Lighthouse 100 across audited categories; authenticated route screenshots still absent | `shots/home-single-header-{light,dark,mobile}.png`; see `t10-screenshots.md` |

## Final counts (this run)

| Suite | Count | Exit |
|---|---|---|
| pytest `backend/tests/` | **190 passed** (4 warnings) | 0 |
| vitest `npm test` | **84 passed / 12 files** | 0 |
| `npx tsc --noEmit` | 0 errors | 0 |
| `npm run lint` | 0 errors | 0 |
| `npm run build` | 17 routes, TS clean | 0 |

All 11 tasks remain `[x]` for implementation. Automated suites are green, the practice-feedback ownership migration is applied, and public-route evidence is current. Overall EvidenceQA verdict remains **NEEDS WORK** until the branch is deployed and authenticated T1–T11 production evidence is captured.
