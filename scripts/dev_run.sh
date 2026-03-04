#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
LOG_DIR="${ROOT_DIR}/logs"
BACKEND_LOG="${LOG_DIR}/backend-dev.log"
FRONTEND_LOG="${LOG_DIR}/frontend-dev.log"

mkdir -p "$LOG_DIR"

echo "🚀 Launching backend and frontend dev servers in new Terminal windows..."
echo "Backend log:    $BACKEND_LOG"
echo "Frontend log:   $FRONTEND_LOG"
echo "Timestamps and full stderr/stdout will be captured."

# Backend
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd ${ROOT_DIR}/apps/api && pnpm install && (LOGIN_DEBUG=1 pnpm run dev 2>&1 | tee '${BACKEND_LOG}')"
end tell
EOF

# Frontend
osascript <<EOF
tell application "Terminal"
    activate
    do script "cd ${ROOT_DIR}/apps/web && pnpm install && (pnpm run dev 2>&1 | tee '${FRONTEND_LOG}')"
end tell
EOF

echo "✔️ Dev servers launching."
echo "You may close this window; dev environment is running in separate terminals."
echo "Tail logs with: tail -f \"$BACKEND_LOG\" and tail -f \"$FRONTEND_LOG\""

open http://localhost:5173
open http://localhost:4000
