#!/usr/bin/env bash
# Vercel build script for the Flutter web app.
# Installs Flutter (cached in $HOME) when it is not available, then builds.
set -e

# Pin the Flutter version the app was built for:
#   - needs Dart >= 3.8 (pubspec sdk ^3.8.0), so 3.27 is too old
#   - Dart >= 3.11 breaks the google_fonts 6.3.0 dependency (const FontWeight
#     map keys are now rejected), so newest stable (Dart 3.12) fails.
# Flutter 3.35 ships Dart 3.9 — satisfies both constraints.
FLUTTER_VERSION="${FLUTTER_VERSION:-3.35.0}"

if ! command -v flutter >/dev/null 2>&1; then
  echo "[deploy] Installing Flutter $FLUTTER_VERSION..."
  if [ ! -d "$HOME/flutter" ]; then
    git clone --depth 1 -b "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$HOME/flutter"
  fi
  export PATH="$PATH:$HOME/flutter/bin"
  flutter config --no-analytics >/dev/null 2>&1 || true
fi

echo "[deploy] flutter $(flutter --version | head -1)"
flutter pub get

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
echo "[deploy] Building web app with API_BASE_URL=$API_BASE_URL"

# Supabase config is injected at build time so no secrets live in the repo.
# Preference order: individual CI env vars (SUPABASE_*) > local dart_defines.env.
SUPABASE_DEFINES=()
if [ -f dart_defines.env ]; then
  SUPABASE_DEFINES+=(--dart-define-from-file=dart_defines.env)
fi
for VAR in SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -n "${!VAR}" ]; then
    SUPABASE_DEFINES+=(--dart-define="$VAR=${!VAR}")
  fi
done
if [ ${#SUPABASE_DEFINES[@]} -eq 0 ]; then
  echo "[deploy] ERROR: Supabase configuration missing."
  echo "[deploy] Set SUPABASE_URL and SUPABASE_ANON_KEY env vars in CI, or create"
  echo "[deploy] frontend/mocker_web/dart_defines.env (cp dart_defines.env.example dart_defines.env)."
  exit 1
fi

flutter build web --release \
  --dart-define=API_BASE_URL="$API_BASE_URL" \
  "${SUPABASE_DEFINES[@]}"
