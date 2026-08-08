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
2. In **SQL Editor**, run the contents of `supabase/schema.sql`.
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
- `WS /ws/{session_id}` — live interviewer + judge report