# Hustlrzz — Frontend (Flutter Web)

Flutter Web app for AI-powered mock interviews: resume upload, personalized Q&A,
a live AI interviewer over WebSocket, and detailed performance feedback.

## Quick Start

### Prerequisites
- Flutter SDK 3.x
- A backend running at `http://localhost:8000` (see root README)
- A Firebase project with Authentication + Firestore enabled

### Run

```bash
flutter pub get
cp dart_defines.env.example dart_defines.env   # fill in your Firebase values
flutter run -d chrome --web-port=3000 \
  --dart-define-from-file=dart_defines.env \
  --dart-define=API_BASE_URL=http://localhost:8000
```

> **Firebase:** all Firebase config values (including the API key) are injected
> at build/run time via `dart_defines.env` (gitignored — no secrets in the
> repo). See `dart_defines.env.example`.
> `FIREBASE_MEASUREMENT_ID` is optional; the rest are required for auth to work.

### Production build

```bash
flutter build web --release \
  --dart-define-from-file=dart_defines.env \
  --dart-define=API_BASE_URL=https://your-backend.example.com
```

In CI, set the `FIREBASE_*` environment variables instead (the `deploy.sh`
script picks them up automatically). Deploy the `build/web` folder to Vercel,
Firebase Hosting, or any static host.

## Architecture

```
lib/
├── config/          # API endpoints & configuration (API_BASE_URL dart-define)
├── data/            # Mock data (fallback when the API is unreachable)
├── models/          # Data models
├── pages/           # Dashboard, Prepare, Mock Interview, Q&A, Feedback, Profile
├── services/        # REST + WebSocket service layer
├── theme/           # App theme
└── widgets/         # Reusable components
```

- **State management:** Provider
- **Real-time chat:** `web_socket_channel` (text protocol — audio turns are transcribed server-side)
- **Auth:** Firebase Auth (Google sign-in)

## Feature areas

1. **Authentication** — Google sign-in, account init, profile
2. **Interview preparation** — PDF resume upload + job description → AI workflow
3. **Mock interview** — timed WebSocket chat with the AI interviewer
4. **Q&A review** — generated questions + model answers per position
5. **Feedback** — session history with scores, strengths, improvements & resources
