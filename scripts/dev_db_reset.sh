#!/usr/bin/env bash
set -euo pipefail

# These match your docker-compose.yml
DB_NAME="${DB_NAME:-hanabi_dev}"
DB_USER="${DB_USER:-hanabi_user}"
DB_PASSWORD="${DB_PASSWORD:-hanabi_password}"
DB_CONTAINER_NAME="${DB_CONTAINER_NAME:-hanabi_db}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SCHEMA_FILE="${ROOT_DIR}/apps/api/db/schema.sql"
SAMPLE_DATA_FILE="${ROOT_DIR}/apps/api/db/sample_data.sql"

if [ ! -f "${SCHEMA_FILE}" ]; then
  echo "Schema file not found at ${SCHEMA_FILE}"
  exit 1
fi

if [ ! -f "${SAMPLE_DATA_FILE}" ]; then
  echo "Sample data file not found at ${SAMPLE_DATA_FILE}"
  exit 1
fi

echo "Applying schema from ${SCHEMA_FILE}..."
docker exec -i \
  -e PGPASSWORD="${DB_PASSWORD}" \
  "${DB_CONTAINER_NAME}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" < "${SCHEMA_FILE}"

echo "Applying sample data from ${SAMPLE_DATA_FILE}..."
docker exec -i \
  -e PGPASSWORD="${DB_PASSWORD}" \
  "${DB_CONTAINER_NAME}" \
  psql -U "${DB_USER}" -d "${DB_NAME}" < "${SAMPLE_DATA_FILE}"

echo "✅ Database reset complete."
