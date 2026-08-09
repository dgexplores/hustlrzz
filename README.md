# Hustlrzz V2 — AI Mock Interview Coach

English-native AI mock interview coach for deliberate, role-specific practice.
It turns a candidate's own material into a preparation plan, runs live mock
interviews, and saves practical feedback for the next session.

| Project | What it contributes |
| --- | --- |
| **hustlrzz** | Resume + JD preparation workflow, WebSocket live interviewer, judge scoring, saved history |
| **interview-skills** | Company-style interview profiles (Google, Amazon, Meta, Microsoft...), JD-vs-resume match + resume gap analysis, salary negotiation coaching |
| **AI-Interview-Coach** | Next.js 15 UI, MediaPipe in-browser body-language tracking (eye contact, posture, hand gestures), scored coaching report |

## Stack

- **Frontend:** Next.js 15 + Tailwind + shadcn-style UI
- **Backend:** Python · FastAPI · WebSockets
- **AI (multi-provider):** Groq (Llama 3.3, free tier) default · Gemini optional
- **Auth & storage:** Supabase Auth + Postgres with Row-Level Security
- **Camera analysis:** MediaPipe runs fully in-browser (video never leaves device)
- **Candidate knowledge (optional):** Gemini embeddings + Supabase pgvector, scoped to each candidate and used to ground interview follow-ups

## What it can do

- **Prepare a role-specific interview pack:** paste a resume and job description
  to generate a JD match, focused questions, answer hints, follow-ups, and model
  answers. Preparation defaults to 12 questions for a responsive live workflow.
- **Run a live mock interview:** a WebSocket interviewer asks prepared questions,
  accepts typed or browser-dictated answers, and returns a final coaching report.
- **Give private camera feedback:** MediaPipe tracks pose, eye contact, posture,
  and gestures in the browser; camera frames are not uploaded by this app.
- **Coach salary conversations:** create a structured negotiation script from a
  candidate's role, current compensation, target range, and offer context.
- **Track progress:** retain preparation packs, transcripts, and scored reports in
  a candidate-owned Supabase account.
- **Ground follow-ups with RAG:** optionally index resume text, portfolio details,
  practice notes, and previous reports in pgvector. Retrieved context is
  user-scoped, source-labelled, and never required for the main interview flow.
- **Stay resilient:** Groq is the primary chat provider and Gemini is a fallback;
  optional web research is disabled by default and time-bounded when enabled, so
  it cannot leave preparation stuck loading.

## Project layout

```
backend/         FastAPI app (prep workflow, live interviewer, judge, coaching, RAG), requirements, Dockerfile
frontend/        Next.js app (auth, prepare, interview, coaching, dashboard)
supabase/        schema, migrations, and hosted Auth configuration
docs/            operational guidance, including future verified-email setup
Dockerfile       backend image for Railway/any Docker host
```

## Local setup

### 1. Supabase
1. Create a project at supabase.com.
2. In **SQL Editor**, run the contents of `supabase/schema.sql`. It includes the pgvector-backed candidate knowledge schema. Existing deployments can instead run `supabase/migrations/20260809110000_rag_knowledge.sql`.
3. Optional: enable Google sign-in in Authentication → Providers.
4. Copy project URL + `anon` and `service_role` keys from Project Settings → API.

### 2. Backend
```bash
cd backend
uv venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill GROQ_API_KEY (free) or GEMINI_API_KEY + SUPABASE keys
uvicorn backend.app:app --reload --port 8000
```
API docs → http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local   # Supabase URL + anon + API_URL=http://localhost:8000
npm run dev
```
Open http://localhost:3000, sign up, grant camera + microphone, prepare a role,
then start an interview. Demo configuration creates a session immediately after
email/password signup; see [email setup](docs/EMAIL_SETUP.md) to enable verified
email later through Resend.

## Deployment notes

- **Vercel:** set the project root directory to `frontend`. Configure
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `NEXT_PUBLIC_API_URL` for both Preview and Production.
- **Railway:** deploy the repository Dockerfile, expose the service port supplied
  by Railway, and set `CORS_ORIGINS` for custom/local origins. The backend also
  has a narrow `CORS_ORIGIN_REGEX` for this Vercel project's generated URLs.
- **Supabase:** apply `supabase/schema.sql` for a fresh project, or apply the
  RAG migration to an existing project. Keep `SUPABASE_SERVICE_ROLE_KEY` on the
  backend only; it must never be exposed as a frontend environment variable.
- **Production check:** `GET /health` reports backend, AI-provider, and database
  readiness. A failed optional RAG operation does not stop preparation or live
  interviews.

## Feature endpoints (English)

- `POST /workflows/start` — resume + JD → questions + answers + company match
- `GET /workflows` / `GET /interviews` — history
- `GET /companies` — company interview profiles
- `POST /coaching/salary` — structured salary negotiation script
- `POST /coaching/analyze` — JD-vs-resume match
- `GET /knowledge/status`, `POST /knowledge/documents`, `POST /knowledge/search` — optional candidate-owned RAG knowledge base
- `WS /ws/{session_id}` — live interviewer + judge report

## Candidate knowledge flow (RAG)

RAG is optional and deliberately additive: the interview continues when the
embedding provider or knowledge database is unavailable. When configured, the
backend validates and chunks candidate-owned material, embeds it with Gemini,
and stores the vectors in `knowledge_chunks`. Each retrieval query is filtered
by `user_id` in both the API call and the database function. During a live
interview the three most relevant, source-labelled chunks are added to the
interviewer prompt; the model is instructed to use them only when relevant and
not invent candidate experience. Final reports are also indexed to support
future practice.

For a production deployment, set `GEMINI_API_KEY`, run the included Supabase
schema/migration, and monitor embedding-provider quotas. The application
returns an explicit knowledge-unavailable state while retaining preparation and
interview functionality.
