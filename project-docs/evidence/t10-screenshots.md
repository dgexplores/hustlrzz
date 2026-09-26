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

## 2026-09-26 hero rebuild

Directory: `project-docs/evidence/shots/` (production `next start` on `localhost:4321`)

| File | Viewport | Observed state |
|---|---|---|
| `shots/hero-1440-light.png` | 1440×900 light | h1 at 72px dominating three 48px section headings; nav reads Prepare / Rehearse / Coach; three-step value chain panel at right; privacy line under the CTAs |
| `shots/hero-390-dark.png` | 390×844 dark | Single-column stack, both CTAs on one row, panel fully visible below the fold line |
| `shots/hero-1440-light-production.png` | 1440×900 light, **deployed** | `hustlrzz.vercel.app` after `20ef97b`; pixel-equivalent to the local build, confirming the deploy |

Measured on the production build:

| Check | Result |
|---|---|
| `h1` vs `h2` size | 72/48 at 1440, 60/48 at 768, 36/30 at 320 and 390 — heading hierarchy corrected (it was previously inverted: h1 48px, h2 60px) |
| Horizontal overflow | none at 320, 390, 768, 1024, 1440 |
| Viewport 320×568 | nav bottom 94px, primary CTA bottom 77px, value-chain panel top 560px — CTA and panel both begin inside the first viewport. The first step's own label sits at 581px, 13px under the fold on this unusually short viewport. |
| Touch targets < 44px | none, apart from the visually hidden skip link |
| Reduced motion | all three steps render complete; zero inline transforms anywhere in the hero |

Two defects found by looking at the rendered result rather than the code:

- The step-3 score bars were originally 13/11/13/10/9px, which read as a **loading skeleton** next to real loading states. Rebalanced to 30/20/26/16/23px so they read as a score profile.
- `QuestionCards` applied a `translateY` that was redundant with its `top` offset. Removed, so the reduced-motion guarantee of zero transforms holds.

Lighthouse Best Practices reads **96**, not 100 — see `commands.md` for the traced cause (pre-existing `401` from `/api/auth/session`) and the production SEO/agentic crawler defect fixed in this pass.
