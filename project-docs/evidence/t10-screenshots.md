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
| `shots/home.png` | `/` | Earlier landing capture before the duplicate-header correction |
| `shots/home-single-header-light.png` | `/` | Production build, 1440×1000, light theme; exactly one primary header |
| `shots/home-single-header-dark.png` | `/` | Production build, 1440×1000, dark theme; exactly one primary header |
| `shots/home-single-header-mobile.png` | `/` | Production build, 390×844, dark mobile; compact single header, no overlap |
| `shots/privacy.png` | `/legal/privacy` | Privacy content page — renders clean |
| `shots/dashboard-signed-out.png` | `/dashboard` (signed out) | AuthGate sign-in form (Welcome to Hustlrzz / Sign In / Google) — correct redirect-to-auth behavior |

Lighthouse snapshot audits on the corrected production build scored Accessibility 100, Best Practices 100, SEO 100, and Agentic Browsing 100 in desktop light, desktop dark, and mobile dark viewports. The original marquee and scroll-reveal contrast failures no longer reproduce. The scroll-reveal pre-animation opacity floor was raised from 12% to 40% dark / 60% light so partially revealed text remains WCAG AA large-text contrast compliant; the reveal still animates to full opacity.

Browser closed and temp server stopped after capture.
