# Prometheus 2 / SPEED October AI Challenge — submission pack

Hackathon: educational AI tool · $1,500 ($1k 1st) · solo ok (1-4) · students only
Submit: 2-min demo video + public source code + live URL
Branch: `main` (merged from `prometheus-edu`, deleted) · Deadline: Oct 14, 2026 11:45pm EDT

## Links (fill after deploy)

- Live app: https://hustlrzz-app.vercel.app
- API health: https://hustlrzz-api.onrender.com/health (expect `ai_configured:true, db_ready:true`)
- Demo video: <YouTube/unlisted link>
- Devpost project: <link after submitting>

## Backend hosting (Railway trial expired → Render free)

`render.yaml` blueprint at repo root, validated. Deploy (3 clicks, keys stay in dashboard):
1. render.com → New → Blueprint → select `dgexplores/hustlrzz`, branch `main` → Apply.
2. Fill sync:false secrets from old Railway variables: `GROQ_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (+ optional `SENTRY_DSN`).
3. Wait for live → set Vercel `NEXT_PUBLIC_API_URL` to the onrender URL → redeploy frontend.
Warm `GET /health` before recording and before judges click (free tier sleeps ~15 min).

Backend verified working with prod env (local smoke 2026-09-08):
`{"status":"ok","ai_configured":true,"provider":"groq","db_ready":true}`.
Video can be recorded TODAY against local backend
(`railway run -- uvicorn backend.app:app --port 8123` + frontend `.env.local`
`NEXT_PUBLIC_API_URL=http://localhost:8123`) — no cloud needed for filming.

## Pitch (paste into Devpost)

**Title:** CampusPrep AI — Learn the interview, not just survive it
**Tagline:** Paste a resume + JD, get a question pack, practice live with an AI
interviewer, and learn WHY every model answer works — standard or explained simply.

**What it does (4 lines):**
1. Prepare: resume + JD → tailored questions, model answers, JD-match, company brief.
2. Learn: every model answer has a Why-it-works tutor (technique, structure, quotes, upgrades, reuse rule) with an Explain-simply mode.
3. Practice: live AI interviewer (typed/voice, 3 personas) with on-device body-language signals — camera optional, video never uploaded.
4. Improve: grounded judge report, progress trajectory, spaced-repetition drills auto-built from weak areas.

## Judging map (25 pts each)

- Educational Impact: interview prep + Learn mode + ELI5 + drills = teaches technique, not answers.
- Creative AI: Groq↔Gemini auto-fallback, RAG-grounded follow-ups, memory-biased probing, evidence-cited company research.
- Technical Execution: 72 pytest green, tsc clean, prod build green, rate limits, auth, privacy-first camera.
- Pitch: 2-min video per `docs/DEMO_VIDEO_SCRIPT.md`.

## Pre-submit checklist

- [x] Backend live on Render: `{"status":"ok","ai_configured":true,"provider":"groq","db_ready":true}` + CORS verified for frontend origin
- [x] Frontend live at https://hustlrzz-app.vercel.app (fresh project; old `hustlrzz` project hijacked by unrelated `mocker_web` settings)
- [ ] `/health` shows ai_configured + db_ready true
- [ ] Judge demo account created + seeded (resume/JD/pack), quota fresh — see below
- [ ] Video uploaded unlisted, link first frame + description
- [ ] Devpost: code link = this repo/branch, live link, 2-min video

## Judge demo account

Create in Supabase Auth (email/password), share creds in Devpost private notes + video
first frame. Pre-run: Prepare with sample resume/JD so dashboard shows 1 pack +
trajectory. Resume Analyzer quota is 3/day — use a fresh account on submit day.
