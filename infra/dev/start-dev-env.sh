#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_ENV_FILE="${ROOT_DIR}/apps/api/.env"
API_ENV_EXAMPLE_FILE="${ROOT_DIR}/apps/api/.env.example"
DEFAULT_OLD_DB_URL="postgres://hanabi_user:hanabi_password@localhost:5432/hanabi_dev"
DEFAULT_NEW_DB_URL="postgres://hanabi_user:hanabi_password@localhost:55432/hanabi_dev"

if [ ! -f "${API_ENV_FILE}" ]; then
  if [ ! -f "${API_ENV_EXAMPLE_FILE}" ]; then
    echo "Missing ${API_ENV_FILE} and template ${API_ENV_EXAMPLE_FILE}. Cannot start dev environment."
    exit 1
  fi

  cp "${API_ENV_EXAMPLE_FILE}" "${API_ENV_FILE}"
  echo "Created apps/api/.env from apps/api/.env.example"
fi

if grep -q "^DATABASE_URL=${DEFAULT_OLD_DB_URL}$" "${API_ENV_FILE}"; then
  sed -i.bak "s|^DATABASE_URL=.*$|DATABASE_URL=${DEFAULT_NEW_DB_URL}|" "${API_ENV_FILE}"
  rm -f "${API_ENV_FILE}.bak"
  echo "Updated apps/api/.env DATABASE_URL to localhost:55432"
fi

bash "${ROOT_DIR}/infra/dev/check-docker.sh"

echo "Starting Docker services (db)..."
docker compose -f "${ROOT_DIR}/docker/dev/docker-compose.yml" up -d db

echo "Waiting for database to be ready..."
DB_PORT=55432 bash "${ROOT_DIR}/scripts/wait_for_db.sh"

if [ "${DEV_RESET_DB:-0}" = "1" ]; then
  echo "DEV_RESET_DB=1 detected. Resetting dev database (schema + sample data)..."
  bash "${ROOT_DIR}/infra/dev/seed-dev-env.sh"
else
  echo "Skipping database reset (default behavior)."
  echo "To force a reset on startup, run with DEV_RESET_DB=1."
fi
