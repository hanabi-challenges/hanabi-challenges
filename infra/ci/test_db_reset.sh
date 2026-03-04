#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

DB_CONTAINER_NAME="${DB_CONTAINER_NAME:-hanabi_db_test}"
DB_NAME="${DB_NAME:-hanabi_test}"
DB_USER="${DB_USER:-hanabi_user}"
DB_PASSWORD="${DB_PASSWORD:-hanabi_password}"

SCHEMA_FILE="${ROOT_DIR}/apps/api/db/schema.sql"

if [ ! -f "${SCHEMA_FILE}" ]; then
  echo "Schema file not found at ${SCHEMA_FILE}"
  exit 1
fi

echo "🧪 Starting test database container..."
docker compose -f "${ROOT_DIR}/docker/test/docker-compose.yml" -p hanabi-tests up -d db_test

# We now use a helper postgres:16 container on the same network to:
# 1) wait for Postgres inside the network
# 2) apply the schema using psql inside that helper container
echo "⏳ Waiting for Postgres (from helper container) and applying schema..."

docker run --rm \
  --network hanabi-tests_default \
  -v "${SCHEMA_FILE}":/schema/schema.sql:ro \
  -e PGPASSWORD="${DB_PASSWORD}" \
  -e DB_HOST="${DB_CONTAINER_NAME}" \
  -e DB_PORT=5432 \
  -e DB_USER="${DB_USER}" \
  -e DB_NAME="${DB_NAME}" \
  postgres:16 \
  bash -lc '
    echo "Waiting for Postgres at ${DB_HOST}:${DB_PORT}..."
    for i in {1..30}; do
      if pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" > /dev/null 2>&1; then
        echo "Postgres is ready."
        break
      fi
      echo "Postgres not ready yet..."
      sleep 1
    done

    echo "📜 Applying schema from /schema/schema.sql..."
    psql \
      -h "${DB_HOST}" \
      -p "${DB_PORT}" \
      -U "${DB_USER}" \
      -d "${DB_NAME}" \
      -v ON_ERROR_STOP=1 \
      -f /schema/schema.sql
  '

echo "✅ Test database is ready (schema applied)."
