# Hustlrzz V2 — AI Mock Interview Coach

English-native AI mock interview coach. Combines the best of three earlier
projects into one advanced platform:

| Project | What it contributes |
| --- | --- |
| **hustlrzz** | Prep workflow (resume + JD → personalized questions + model answers via web-searched real questions), WebSocket live interviewer, judge scoring, Saved history |
| **interview-skills** | Company-style interview profiles (Google, Amazon, Meta, Microsoft...), JD-vs-resume match + resume gap analysis, salary negotiation coaching |
| **AI-Interview-Coach** | Next.js 15 UI, MediaPipe in-browser body-language tracking (eye contact, posture, hand gestures), scored coaching report |

## Stack

- **Frontend:** Next.js 15 + Tailwind + shadcn-style UI
- **Backend:** Python · FastAPI · WebSockets
- **AI (multi-provider):** Groq (Llama 3.3, free tier) default · Gemini optional
- **Auth & storage:** Supabase Auth + Postgres with Row-Level Security
- **Camera analysis:** MediaPipe runs fully in-browser (video never leaves device)
- **Candidate knowledge (optional):** Gemini embeddings + Supabase pgvector, scoped to each candidate and used to ground interview follow-ups

## Project layout

```
backend/         FastAPI app (prep workflow, live interviewer, judge, coaching), requirements, Dockerfile
frontend/        Next.js app (auth, prepare, interview, coaching, dashboard)
supabase/        schema.sql to run once in Supabase SQL editor
Dockerfile       backend image (Render)
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
Open http://localhost:3000, sign up, grant camera + microphone, prepare a role, start an interview.

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
