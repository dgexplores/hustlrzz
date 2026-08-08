# Hustlrzz — AI Mock Interview Coach

A web app that runs practice interviews with you before the real thing. Upload your resume and a job description, and it builds a personalized question bank for the role. Then an AI interviewer actually talks you through a timed practice session, and afterwards you get a breakdown of what went well and what to work on.

**Live demo → https://hustlrzz.vercel.app**

I built this because I kept messing up interviews — freezing on behavioral questions, rambling without structure, never knowing how I actually did. Practicing with a friend only goes so far, so I made something that would grill me properly and then tell me where I fell short.

## What it does

- **Preparation** — upload a resume (PDF or pasted text) plus a job description. The backend summarizes your background, searches the web for questions people actually get asked for that role, and generates a set of questions with sample answers.
- **Mock interview** — pick one of your prepared roles and a duration (5–60 min). A live AI interviewer chats with you over WebSocket, follows up on your answers, and keeps a transcript the whole time.
- **Feedback** — when you end the session it reviews the transcript and scores you across several areas, then links resources for the specific things you struggled with.
- **History** — every transcript and feedback report is saved, so you can track your progress across multiple sessions.

## Tech stack

- **Frontend:** Flutter (web) · Material 3 · Provider
- **Backend:** Python · FastAPI · WebSockets
- **AI:** Groq free tier — Llama 3.3 70B (text), Whisper (speech-to-text), Orpheus (text-to-speech)
- **Auth & storage:** Supabase — Auth (Google/Apple/email sign-in) + Postgres with Row-Level Security
- **Hosting:** Frontend on Vercel · backend on Render (Docker)

I went with Groq mostly because it's actually free — no credit card, roughly a thousand requests a day, which is plenty for this app. The first version ran on Google's Gemini, but the free daily quota would run out after a few practice sessions and the 2.0 models eventually got retired, so I rewrote the whole AI layer on Groq. Best decision I made on this project.

## Running it locally

### Backend

```bash
cd backend
python -m venv venv            # requires Python 3.10+ (see note below)
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env           # then fill in your keys
uvicorn backend.app:app --reload --port 8000
```

You'll need:

- A **Groq API key** (free) from https://console.groq.com — add extra keys as a
  comma-separated `GROQ_API_KEYS` list for automatic failover on rate limits
- A **Supabase project** (free, no credit card) from https://supabase.com — run
  `supabase_schema.sql` (repo root) in its SQL editor once, then copy the project
  URL + keys from *Project Settings → API*

> **Python 3.10+ is required** — `python-multipart` (file uploads) needs it.
> If your system Python is older, install a newer one (e.g. `brew install
> python@3.11`) and point `python -m venv` at it.

API docs land at http://localhost:8000/docs once it's running.

### Frontend

```bash
cd frontend/mocker_web
flutter pub get
flutter run -d chrome --web-port=3000 --dart-define=API_BASE_URL=http://localhost:8000
```

The frontend reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` from `frontend/mocker_web/dart_defines.env` (copy from `dart_defines.env.example`).

## How the interview flow works

1. **Preparation** — the workflow runs four steps: summarize your resume → search for real interview questions for the role → generate personalized questions → write model answers. Results are saved to Postgres (via the backend).
2. **Mock interview** — the frontend opens a WebSocket to the backend. Your answers go to the AI interviewer, which comes back with a follow-up question. The whole conversation is stored as a transcript.
3. **Feedback** — when the session ends (you stop it, or the timer runs out), a separate judge pass evaluates the transcript and writes the report. It even checks that the resource links it recommends actually load, and re-searches for fresh ones if a link is dead.

## Deployment

The backend deploys to Render via the `render.yaml` blueprint at the repo root (Docker-based, Python 3.10). The frontend deploys to Vercel with `frontend/mocker_web/vercel.json` — the build installs Flutter 3.35 and compiles the web app with `--dart-define=API_BASE_URL=...`.

## Security

- **Row-Level Security (RLS)** — `supabase_schema.sql` (repo root) defines
  Postgres RLS policies: every user can only read/write their own rows
  (`auth.uid()` must equal the row's owner), system tables are read-only for
  authenticated clients, and the backend uses the service-role key (which
  bypasses RLS) for server-side operations. This is enforced by Postgres
  itself — even if the public anon key leaks, no one can touch another
  user's data.
- **Secrets** — never committed. The public Supabase keys are injected at
  build time (`frontend/mocker_web/dart_defines.env`, gitignored); the backend
  reads `GROQ_API_KEY` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` from the
  environment (Render / `.env`). A comma-separated `GROQ_API_KEYS` list adds
  backup Groq keys: on a rate limit (HTTP 429) the provider automatically
  rotates to the next key, so a busy day on one free key doesn't take the app
  down. The service-role key is backend-only and never exposed to the browser.
- **CI / repository security** — every push and PR runs the backend test
  suite (Python 3.10 & 3.11), flake8 lint, and CodeQL code scanning via
  GitHub Actions. `main` is protected: direct pushes are blocked (even for
  admins), so all changes land via pull requests with passing checks.
  Dependabot is enabled and dependencies are pinned to exact versions.
- **Honest failures** — workflow/PDF saves surface errors instead of silently
  reporting success with an ID that was never persisted; the interview judge
  logs the real reason when feedback can't be generated and retries with
  backoff. Cross-user access to workflows/feedback returns 404 (ownership is
  enforced both in queries and responses).
- **Auth** — all API routes require a verified Supabase access token (JWT);
  interview WebSocket sessions are bound to the user who started them
  server-side with an opaque token.
- **Input validation** — social URLs are validated with pydantic `HttpUrl`
  plus an SSRF guard; uploads are size-limited (10 MB) and checked for PDF
  magic bytes.
- **Rate limiting** — per-IP sliding-window limits on all endpoints, with a
  stricter tier for expensive AI endpoints (env-configurable).
- **CORS** — explicit allowed origins/methods/headers only.
- **Encryption** — Postgres data is encrypted at rest (managed by Supabase/
  the cloud provider); access is further limited by RLS above.

## What I'd still like to add

- **Voice mode** — the backend already supports Whisper transcription and TTS, but the UI doesn't have a microphone button wired up yet
- **Camera/body-language analysis** — eye contact, posture, hand gestures during the interview, folded into the feedback scores (the feature I'm most excited about)
- **Stricter question counts** — the model sometimes ignores the "generate exactly N questions" instruction no matter how loudly the prompt yells it

## Supabase setup (one-time)

1. **Create the project** — https://supabase.com → **New project** (free tier,
   no credit card).
2. **Run the schema** — open the **SQL Editor**, paste the contents of
   `supabase_schema.sql` (repo root), run it. This creates the tables and the
   Row-Level Security policies.
3. **Configure the app** — put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in
   `frontend/mocker_web/dart_defines.env` (and the same two vars on Vercel,
   Production), and `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on Render.
4. **Auth providers** — Supabase dashboard → **Authentication → Sign In /
   Providers** → enable **Email** and **Google** (paste your Google OAuth
   Client ID + Secret from Google Cloud Console; add
   `https://<ref>.supabase.co/auth/v1/callback` to the client's authorized
   redirect URIs). Under **URL Configuration**, set the Site URL to
   `https://hustlrzz.vercel.app` and add `http://localhost:3000` and
   `https://hustlrzz.vercel.app` to Redirect URLs.

> Google/Apple sign-in uses Supabase's hosted OAuth flow — it does **not**
> call the People API, so no extra Google APIs are needed.

## Known quirks

- The free Render instance goes to sleep after ~15 minutes of inactivity, so the first request after a break can take 30–60 seconds to wake up.
- Works best in Chrome.
- Groq's free tier allows about 30 requests/minute — the backend rotates across
  backup keys (`GROQ_API_KEYS`) on rate limits and retries with backoff, so
  brief spikes are absorbed. Sustained hammering can still exhaust the quota;
  the error message will tell you exactly that.


feel free to colaborate fork this and add things you wish it can have .........


## License

MIT — see [LICENSE](LICENSE).
