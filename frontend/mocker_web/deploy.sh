#!/usr/bin/env bash
# Vercel build script for the Flutter web app.
# Installs Flutter (cached in $HOME) when it is not available, then builds.
set -e

if ! command -v flutter >/dev/null 2>&1; then
  echo "[deploy] Installing Flutter..."
  if [ ! -d "$HOME/flutter" ]; then
    git clone --depth 1 -b stable https://github.com/flutter/flutter.git "$HOME/flutter"
  fi
  export PATH="$PATH:$HOME/flutter/bin"
  flutter config --no-analytics >/dev/null 2>&1 || true
fi

echo "[deploy] flutter $(flutter --version | head -1)"
flutter pub get

API_BASE_URL="${API_BASE_URL:-http://localhost:8000}"
echo "[deploy] Building web app with API_BASE_URL=$API_BASE_URL"
flutter build web --release --dart-define=API_BASE_URL="$API_BASE_URL"
