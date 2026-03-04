#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Rebuilding schema..."
docker exec -i hanabi_db psql -U hanabi_user -d hanabi_dev < "${ROOT_DIR}/apps/api/db/schema.sql"

echo "Loading sample data..."
docker exec -i hanabi_db psql -U hanabi_user -d hanabi_dev < "${ROOT_DIR}/apps/api/db/sample_data.sql"

echo "Done!"
