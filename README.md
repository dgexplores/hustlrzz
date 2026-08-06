# 🎯 Hustlrzz — AI-Powered Interview Preparation Platform

**Ace your next interview with AI-powered mock interviews, personalized question banks, and detailed performance feedback — completely free to run.**

Hustlrzz is a full-stack interview-coaching platform:

- Upload your resume + a target job description
- An AI pipeline analyzes your profile, searches the web for real industry questions, and generates **personalized Q&A** (up to 50 questions with model answers)
- Practice with a **live AI interviewer** over a timed, real-time chat session
- Get a **structured performance review** — strengths, improvement areas, and hand-picked learning resources

## ✨ Features

### 📋 Interview Preparation
- **PDF resume analysis** — upload your resume (or paste text) for AI-powered parsing
- **Profile enrichment** — optional GitHub and portfolio links are analyzed too
- **Personalized Q&A** — tailored questions + model answers based on your background and the target role
- **Industry research** — real interview questions gathered from the web for your specific role

### 🤖 Live Mock Interviews
- **Real-time AI interviewer** over WebSocket — adaptive follow-up questions based on your answers
- **Timed sessions** (5–60 min) with automatic transcript saving
- **Voice support** — audio turns are transcribed with Whisper and answered out loud (turn-based)

### 📊 Feedback & Analytics
- **Multi-dimensional evaluation** — positives, improvement areas with concrete examples, and actionable suggestions
- **Curated resources** — learning links are verified live; dead links are automatically re-searched
- **Session history** — review every past transcript and feedback report per position

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Flutter Web (Dart, Material 3) |
| Backend | Python FastAPI + WebSocket |
| AI | **Groq** (free tier — llama-3.3-70b text, Whisper STT, Orpheus TTS) |
| Auth + DB | Firebase Auth + Cloud Firestore |
| Deployment | Render (backend) · Vercel or Firebase Hosting (frontend) |

> **Why Groq?** All AI features run on Groq's free tier — roughly 1,000 requests/day on `llama-3.3-70b-versatile`, no credit card required. No API quota walls.

## 🚀 Getting Started

### Prerequisites
- **Python 3.10+**
- **Flutter SDK 3.x** (for the frontend)
- A **Groq API key** (free: https://console.groq.com/keys)
- A **Firebase project** with Authentication (Email/Password + Google) and Firestore enabled

### 1. Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env: add GROQ_API_KEY, your Firebase project id and service-account key path

# Run the API (docs at http://localhost:8000/docs)
uvicorn backend.app:app --reload --port 8000
```

**Firebase setup:** In the Firebase console, go to *Project settings → Service accounts → Generate new private key*, save the JSON as `backend/credentials/firebase_key.json`, and set `FIREBASE_KEY_PATH=credentials/firebase_key.json` in `.env`.

### 2. Frontend

```bash
cd frontend/mocker_web
flutter pub get

# Point the app at your backend
flutter run -d chrome --web-port=3000 \
  --dart-define=API_BASE_URL=http://localhost:8000
```

**Firebase web config:** run `flutterfire configure` in `frontend/mocker_web` (select your Firebase project) to regenerate `lib/firebase_options.dart` with your own project IDs.

### 3. Use it

1. Create an account (Google sign-in)
2. **Prepare** — upload a resume + job description, wait for the AI workflow to finish
3. **Q&A** — review the generated questions and model answers
4. **Mock Interview** — pick a position and duration, then chat with the AI interviewer
5. **Feedback** — read your evaluation after the session

## 🌐 Deployment

### Backend → Render (Blueprint)
1. This repo is pushed to GitHub.
2. Render dashboard → **New → Blueprint** → select this repo. The root
   `render.yaml` is auto-detected; commands run from the repo root and the
   Python version is pinned in `runtime.txt` (3.10.13).
3. When prompted, set the **GROQ_API_KEY** and **FIREBASE_KEY_PATH** env values
   (or use a FIREBASE_KEY_JSON secret). CORS already includes the Vercel URL.
4. Deploy. The backend is then live at `https://hustlrzz-backend.onrender.com`
   (that's the URL the frontend is already built against).

### Frontend → Vercel
```bash
cd frontend/mocker_web
vercel --prod \
  --build-env API_BASE_URL=https://your-backend.onrender.com
```

The Flutter web build is handled by `deploy.sh` (installs Flutter 3.35 in the
build environment). Live: **https://hustlrzz.vercel.app**

## 📁 Project Structure

```
hustlrzz/
├── backend/                  # Python FastAPI backend
│   ├── agents/              # AI agents (interviewer, judge, question/answer generation)
│   ├── api/                 # REST + WebSocket endpoints
│   ├── coordinator/         # Session management + preparation workflow
│   ├── data/                # Firestore models and access layer
│   ├── services/            # PDF, GitHub and portfolio analyzers
│   └── tools/               # Groq provider, Firebase config
└── frontend/
    └── mocker_web/          # Flutter Web frontend
        └── lib/
            ├── pages/       # UI screens
            ├── services/    # API + WebSocket service layer
            ├── models/      # Data models
            ├── widgets/     # Reusable UI components
            └── config/      # App configuration
```

## 📡 API Overview

- `POST /workflows/start-with-pdf` · `POST /workflows/start-with-text` — run the preparation workflow
- `GET /workflows` — list your prepared positions
- `POST /interviews/start` — begin a mock interview session
- `WS /ws/{session_id}` — real-time interview conversation
- `POST /interviews/{workflow}/{session}/feedback` — fetch session feedback

Interactive API docs: `http://localhost:8000/docs`

## 🧪 Testing

```bash
cd backend
export CI=true GOOGLE_CLOUD_PROJECT=dummy
python -m pytest -q
```

## 📝 License

MIT — see [LICENSE](LICENSE).
