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
- **Auth & storage:** Firebase — Auth (Google sign-in) + Firestore
- **Hosting:** Frontend on Vercel · backend on Render (Docker)

I went with Groq mostly because it's actually free — no credit card, roughly a thousand requests a day, which is plenty for this app. The first version ran on Google's Gemini, but the free daily quota would run out after a few practice sessions and the 2.0 models eventually got retired, so I rewrote the whole AI layer on Groq. Best decision I made on this project.

## Running it locally

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env              # then fill in your keys
uvicorn backend.app:app --reload --port 8000
```

You'll need:

- A **Groq API key** (free) from https://console.groq.com
- A **Firebase project** with Email/Password + Google sign-in enabled and Firestore created
- A **service account JSON** saved to `backend/credentials/firebase_key.json` (Project settings → Service accounts → Generate new private key)

API docs land at http://localhost:8000/docs once it's running.

### Frontend

```bash
cd frontend/mocker_web
flutter pub get
flutter run -d chrome --web-port=3000 --dart-define=API_BASE_URL=http://localhost:8000
```

If you're using your own Firebase project, run `flutterfire configure` inside `frontend/mocker_web` to regenerate `lib/firebase_options.dart`.

## How the interview flow works

1. **Preparation** — the workflow runs four steps: summarize your resume → search for real interview questions for the role → generate personalized questions → write model answers. Results are saved to Firestore.
2. **Mock interview** — the frontend opens a WebSocket to the backend. Your answers go to the AI interviewer, which comes back with a follow-up question. The whole conversation is stored as a transcript.
3. **Feedback** — when the session ends (you stop it, or the timer runs out), a separate judge pass evaluates the transcript and writes the report. It even checks that the resource links it recommends actually load, and re-searches for fresh ones if a link is dead.

## Deployment

The backend deploys to Render via the `render.yaml` blueprint at the repo root (Docker-based, Python 3.10). The frontend deploys to Vercel with `frontend/mocker_web/vercel.json` — the build installs Flutter 3.35 and compiles the web app with `--dart-define=API_BASE_URL=...`.

## Security

- **Firestore rules** — strict per-user rules ship in `firestore.rules` at the repo
  root (each user can only read/write their own `users/{uid}` subtree; system
  collections are read-only). **Deploy them before going live:**
  ```bash
  # from the repo root, with firebase-tools installed
  firebase deploy --only firestore:rules
  # or paste the file into Firebase console -> Firestore -> Rules
  ```
- **Secrets** — never committed. Firebase web config is injected at build time
  (`frontend/mocker_web/dart_defines.env`, gitignored); the backend reads
  `GROQ_API_KEY` / `FIREBASE_KEY_JSON` from the environment (Render / `.env`).
- **Auth** — all API routes require a verified Firebase ID token; interview
  WebSocket sessions are bound to the user who started them server-side.
- **Input validation** — social URLs are validated with pydantic `HttpUrl`;
  uploads are size-limited (10 MB) and checked for the PDF magic bytes.
- **Rate limiting** — per-IP sliding-window limits on all endpoints, with a
  stricter tier for expensive AI endpoints (env-configurable).
- **App Check** — the web app attests itself via Firebase App Check
  (reCAPTCHA Enterprise, since the Firebase console now only offers the
  Enterprise provider for web apps). The site key is injected as
  `FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY` (dart-define); see setup below.
- **CORS** — explicit allowed origins/methods/headers only.
- **Encryption** — Firestore data is encrypted at rest by default (Google-managed
  keys); access is further limited to per-user rules above.

## What I'd still like to add

- **Voice mode** — the backend already supports Whisper transcription and TTS, but the UI doesn't have a microphone button wired up yet
- **Camera/body-language analysis** — eye contact, posture, hand gestures during the interview, folded into the feedback scores (the feature I'm most excited about)
- **Stricter question counts** — the model sometimes ignores the "generate exactly N questions" instruction no matter how loudly the prompt yells it

## Firebase App Check setup (web)

1. **Create the key** — Firebase console → **Build → App Check** → *Get
   started* → Web app → choose **reCAPTCHA Enterprise** → *Create a new key*
   (this opens the Google Cloud reCAPTCHA Enterprise page; the default name is
   fine) → copy the **site key**.
2. **Configure the app** — put the site key in `frontend/mocker_web/dart_defines.env`
   (`FIREBASE_APP_CHECK_RECAPTCHA_SITE_KEY=...`) and add the same var to Vercel
   (Settings → Environment Variables → Production) so deploys bake it in.
3. **Deploy** — push/rebuild; the live app now sends App Check tokens.
4. **Enforce** — only after the new build is live, in App Check → *Manage* →
   **Enforce** on Firestore (and optionally Authentication). Enforcing before
   the app ships App Check tokens will lock out the current build.

> The backend (Admin SDK) bypasses App Check, so enforcement doesn't affect
> server-side requests.

## Known quirks

- The free Render instance goes to sleep after ~15 minutes of inactivity, so the first request after a break can take 30–60 seconds to wake up.
- Works best in Chrome.
- Groq's free tier allows about 30 requests/minute — if you hammer the prep workflow you'll occasionally hit a rate limit and just need to retry.


feel free to colaborate fork this and add things you wish it can have .........


## License

MIT — see [LICENSE](LICENSE).
