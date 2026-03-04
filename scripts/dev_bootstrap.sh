#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "Starting Docker services (db)..."
docker compose up -d db

echo "Waiting for database to be ready..."
"${ROOT_DIR}/scripts/wait_for_db.sh"

if [ "${DEV_RESET_DB:-0}" = "1" ]; then
  echo "DEV_RESET_DB=1 detected. Resetting dev database (schema + sample data)..."
  "${ROOT_DIR}/scripts/dev_db_reset.sh"
else
  echo "Skipping database reset (default behavior)."
  echo "To force a reset on startup, run with DEV_RESET_DB=1."
fi
