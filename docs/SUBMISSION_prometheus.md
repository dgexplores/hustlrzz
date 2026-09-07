# Prometheus 2 / SPEED October AI Challenge — submission pack

Hackathon: educational AI tool · $1,500 ($1k 1st) · solo ok (1-4) · students only
Submit: 2-min demo video + public source code + live URL
Branch: `prometheus-edu` (this code) · Deadline: Oct 14, 2026 11:45pm EDT

## Links (fill after deploy)

- Live app: https://hustlrzz.vercel.app
- API health: https://hustlrzzv2-production.up.railway.app/health (expect `ai_configured:true, db_ready:true`)
- Demo video: <YouTube/unlisted link>
- Devpost project: <link after submitting>

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

- [ ] Railway service running (currently OFFLINE — needs plan, trial expired)
- [ ] `hustlrzz.vercel.app` live (needs dashboard Root Directory fix: `frontend/mocker_web` → `frontend`, then redeploy)
- [ ] `/health` shows ai_configured + db_ready true
- [ ] Judge demo account created + seeded (resume/JD/pack), quota fresh — see below
- [ ] Video uploaded unlisted, link first frame + description
- [ ] Devpost: code link = this repo/branch, live link, 2-min video

## Judge demo account

Create in Supabase Auth (email/password), share creds in Devpost private notes + video
first frame. Pre-run: Prepare with sample resume/JD so dashboard shows 1 pack +
trajectory. Resume Analyzer quota is 3/day — use a fresh account on submit day.
