# Backend Architecture

## Stack

- Node.js + Express 5
- TypeScript
- PostgreSQL via `pg`
- JWT auth
- Vitest for unit/integration tests

## Module Layout

- `src/modules/<domain>/...`
- Typical files: `*.routes.ts`, `*.service.ts`, optional `*.controller.ts` and `*.model.ts`
- Route registration centralized in `src/routes/index.ts`

## Request Lifecycle

1. Request enters Express app (`src/app.ts`).
2. Auth middleware validates bearer token for protected routes.
3. Validate/coerce request payloads.
4. Domain service executes DB logic.
5. Errors normalized through shared error middleware.

## DB and Bootstrapping

- Schema file: `apps/api/db/schema.sql`
- Local bootstrap starts Docker Postgres and seeds conditionally.
- Default local startup does not wipe/reset DB; reset is opt-in (`DEV_RESET_DB=1`).

## Realtime Integration

- Notification bridge module pushes DB-triggered events to connected clients.
- Session ladder live updates use websocket-backed state propagation.
