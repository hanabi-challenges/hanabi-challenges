#!/usr/bin/env bash
# Builds the main web app and the tracker client, then merges the tracker
# client's dist into the web app's dist at /tracker/ so they are served
# as a single static publish.

set -euo pipefail

# Bootstrap pnpm / corepack (idempotent on Render)
COREPACK_INTEGRITY_KEYS=0 corepack enable
COREPACK_INTEGRITY_KEYS=0 corepack prepare pnpm@10.31.0 --activate

# Install only what the web app and tracker client need
pnpm install --frozen-lockfile --filter @hanabi-challenges/web... --filter @tracker/client... --filter @tracker/types

# Build tracker/types first (required by tracker/client)
pnpm -C tracker/types run build

# Build the main web app and tracker client in parallel
pnpm -C apps/web run build &
WEB_PID=$!

pnpm -C tracker/client run build &
TRACKER_PID=$!

wait $WEB_PID
wait $TRACKER_PID

# Merge tracker client into the web dist under /tracker/
mkdir -p apps/web/dist/tracker
cp -r tracker/client/dist/. apps/web/dist/tracker/
