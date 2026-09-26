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

Lighthouse Best Practices reads **100** after the signed-out session 401 was corrected. See
`commands.md` for the full record.

## 2026-09-26 display serif pass

The page had been set entirely in Geist Sans at `tracking-tighter`, which read as a generic
generated landing page. Instrument Serif now carries the h1, section headings, marquee, mode titles
and manifesto thesis, while Geist stays on body copy and controls. The hero became an opening slide:
`01 / INTERVIEW PREP` over a hairline rule, the headline with *unforgettable* in true italic, and
the three-step chain restyled as an agenda panel with serif numerals. The pill-shaped SVG accent was
removed from the hero and the bento heading, and its asset deleted along with the orphaned
`.display-type` utility.

Instrument Serif ships 400 only, so `font-semibold` was stripped from every display heading —
leaving it would have the browser synthesise a fake bold, which is a visible failure on a
high-contrast face.

| File | Viewport | Observed state |
|---|---|---|
| `shots/pitch-1440-light.png` | 1440×900 light | Opening-slide hero; serif h1 at 76px with italic emphasis; `01` index over a hairline rule; serif agenda panel |
| `shots/pitch-1440-dark.png` | 1440×900 dark | Same composition on the near-black theme |
| `shots/pitch-390-dark.png` | 390×844 dark | Single column, both CTAs on one row, agenda panel below the CTA |
| `shots/pitch-full-1440-light.png` | full page | Marquee, section headings, mode titles and manifesto all in the serif; card titles stay sans |

| Check | Result |
|---|---|
| Rendered h1 family / weight | `Instrument Serif` / `400`, no synthesised bold |
| Heading hierarchy | h1 76px vs h2 48px at 1440; 38 vs 32 at 390 |
| Contrast, alpha-blended, both themes | zero failures; h1 19.9:1 light, 18.1:1 dark |
| Worst contrast on the page | 5.2:1 against a 4.5 floor |
| Marquee words | 3.46:1 light at 80% opacity (floor 3:1) → raised to 90%, now 6.43:1 dark |
| Horizontal overflow | none at 320, 390, 1440 |

Two defects were caught by inspecting the rendered result rather than the code:

- The step-3 score bars were originally 13/11/13/10/9px, which read as a **loading skeleton** next to real loading states. Rebalanced to 30/20/26/16/23px so they read as a score profile.
- The first contrast audit **ignored alpha** and overstated ratios for `muted-foreground/80` text. Redone with alpha compositing against the resolved background, which surfaced the thin marquee margin above.

A screenshot taken mid-animation initially reported `panelTop: -85`, which looked like a layout fault
but was the capture scrolling. Scroll position is now asserted to be `0` before each capture.
