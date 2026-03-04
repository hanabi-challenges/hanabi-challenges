#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

TEST_DB_CONTAINER="hanabi_db_test"
COMPOSE_FILE="${ROOT_DIR}/docker/test/docker-compose.yml"

# Stops container on exit (even if tests fail)
cleanup() {
  echo "🧹 Cleaning up test DB container..."
  docker compose -f "$COMPOSE_FILE" -p hanabi-tests down -v || true
}
trap cleanup EXIT

echo "🧪 Preparing ephemeral test database..."
"${ROOT_DIR}/infra/ci/test_db_reset.sh"

export NODE_ENV=test
export DATABASE_URL="postgresql://hanabi_user:hanabi_password@localhost:55432/hanabi_test"

echo "🚀 Running backend tests..."
cd "${ROOT_DIR}/apps/api"
pnpm run test:integration

echo "🎉 Tests complete."
