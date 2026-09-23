# EvidenceQA — T10 visual polish screenshots

## Pre-existing T10 shots (light/dark, before/after)

Directory: `/tmp/t10-shots/`

| Path | Note |
|---|---|
| `/tmp/t10-shots/home-before-light.png` | Home, light theme, pre-polish |
| `/tmp/t10-shots/home-before-dark.png` | Home, dark theme, pre-polish |
| `/tmp/t10-shots/home-after-light.png` | Home, light theme, post-polish |
| `/tmp/t10-shots/home-after-dark.png` | Home, dark theme, post-polish |

Also present (backup files from polish pass): `globals.after.bak`, `HomeContent.after.bak`.

## Authed routes — no screenshots

Auth-gated routes (`/dashboard`, `/dashboard/session/[id]`, `/knowledge`, `/settings`, `/prepare`, `/interview`, `/coaching`, `/resume-analyzer`) have **no captured shots** — **no test credentials** available for this run. AuthGate correctly shows sign-in when signed out (see public shot below). Authed UI evidence remains a gap for any tester without credentials.

## Public-route shots captured this run (agent-browser)

Directory: `project-docs/evidence/shots/` (production `npm start` on `localhost:3111`)

| File | Route | Observed state |
|---|---|---|
| `shots/home.png` | `/` | Landing: hero, nav, sample question pack — renders clean |
| `shots/privacy.png` | `/legal/privacy` | Privacy content page — renders clean |
| `shots/dashboard-signed-out.png` | `/dashboard` (signed out) | AuthGate sign-in form (Welcome to Hustlrzz / Sign In / Google) — correct redirect-to-auth behavior |

Browser closed and temp server stopped after capture.
