# Tracker — Architecture

## Overview

The tracker is a distinct package within the Hanabi Competitions monorepo. It shares the repo's existing toolchain, CI, and design system but is architecturally isolated: it has its own routes, database schema, build outputs, and deployment concerns.

```
hanabi-challenges/
├── apps/api/           ← existing site API (unchanged)
├── apps/web/           ← existing site frontend (unchanged)
├── packages/shared/    ← existing shared types
└── tracker/
    ├── server/         ← Express routes, DB queries, services (Node.js)
    ├── client/         ← React frontend mounted at /tracker (Vite)
    ├── types/          ← shared data contracts (imported by both)
    ├── ARCHITECTURE.md ← this file
    ├── PUBLISHING.md   ← publishing and branch procedures
    └── README.md       ← setup and development guide
```

---

## Package Structure

### `tracker/types`

The **source of truth for all request and response shapes**. Both `tracker/server` and `tracker/client` import from `@tracker/types` — neither defines its own independently. If the shape of an API request or response changes, the change happens here first.

### `tracker/server`

The backend package. Contains:

- `src/routes/` — Express router definitions; one file per resource
- `src/db/` — typed async query functions; one file per domain; no ORM
- `src/services/` — business logic (lifecycle engine, notification service, Discord dispatcher, GitHub integration)
- `src/middleware/` — auth, role resolution, permission enforcement, error handling
- `src/migrations/` — timestamped SQL migration files (`YYYYMMDDHHMMSS_description.sql`)
- `src/bot/` — Discord bot entry point (separate process from the Express server)

### `tracker/client`

The frontend package. Built with Vite. Uses the existing site's design system directly — no new design system is introduced, no components are duplicated.

---

## Non-Negotiable Invariants

The following rules are absolute. They are enforced by code review; any PR that violates them must not be merged.

### 1. The Lifecycle Engine Owns Status History

The lifecycle engine (`src/services/lifecycle.ts`) is the **only** code path that:
- Writes to `ticket_status_history`
- Updates `current_status_id` on a ticket

No route handler, service, or utility may write to these tables directly. Violations undermine the integrity of the audit trail and the valid-transitions enforcement.

### 2. Parameterised Queries Everywhere

All database queries use parameterised inputs. **No string interpolation of user data anywhere.** If a query contains a template literal with a user-supplied value, it is a bug and must not be merged.

### 3. Types Package Is the Single Source of Truth

Server and client both import request/response shapes from `@tracker/types`. Neither defines its own independently. A type that lives in only one package is a type that will eventually drift.

### 4. The Discord Bot Is a Separate Process

The Discord bot (`tracker/server/src/bot/index.ts`) has its own entry point and runs as a separate long-lived process. It is not part of the Express server. The two communicate only via the database — the bot writes to `discord_role_sync_log`; the server reads from it.

### 5. Dormant-Until-Go-Live Integrations

The Discord outbound webhook and the Discord bot are dormant until go-live, controlled purely by the **presence or absence of their respective environment variables**:

- No `DISCORD_MOD_WEBHOOK_URL` → outbound webhook does nothing
- No `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` / `DISCORD_MOD_ROLE_NAME` → bot process does not start

No code changes are required at go-live. Setting the environment variables and redeploying is sufficient.

### 6. hanab.live Is the Authoritative Identity Source

The tracker **never creates or manages identities independently**. It only maps hanab.live usernames to local user records. The sequence is always:

1. User authenticates with the existing site (which authenticates via hanab.live)
2. Tracker middleware reads the resolved hanab.live username from the existing session
3. Tracker performs a lookup/upsert on `users.hanablive_username`

The tracker user record is a derived artefact — the hanab.live username is the ground truth.

### 7. Timestamp-Based Migration Filenames

Migration files are named `YYYYMMDDHHMMSS_description.sql` (e.g. `20240315120000_create_tickets.sql`). **Sequential numbers are never used.** This prevents merge conflicts when tracker and main-site migrations are developed in parallel.

---

## Database Strategy

The tracker uses its own schema (`tracker`) within the same PostgreSQL instance as the existing site. This means:

- The tracker's tables are completely separate from the existing site's tables
- A single database instance to manage in production
- The tracker's migration tracking table is named `tracker_schema_migrations` to avoid collision with the existing site's `schema_migrations`
- All tracker table names are unambiguously scoped (either prefixed or in the `tracker` schema)

The query client is `postgres.js` (`postgres` on npm). No ORM. All queries are typed async functions in `tracker/server/src/db/`, one file per domain.

---

## Authentication Architecture

The tracker does not own authentication. The flow is:

1. The existing site authenticates users via hanab.live and establishes a session
2. The tracker's `requireTrackerAuth` middleware reads the hanab.live username from the existing session (via `req.user` or equivalent — see `tracker/README.md` for the exact mechanism)
3. The tracker does a lookup/upsert on `tracker.users` by `hanablive_username`, creating a tracker record on first access and syncing `display_name` if it has changed
4. The resolved tracker user is attached to `req.trackerUser` (namespaced to avoid collision with any existing `req.user`)

Unauthenticated requests to protected tracker routes return HTTP 401 before reaching any route handler.

---

## Permission Model

Permissions are enforced at the route level via the `requirePermission(action)` middleware factory:

```
requirePermission('ticket.create')  → passes if req.trackerRole has ticket.create
requirePermission('ticket.triage')  → passes for moderator and committee, fails for community_member
```

The role is resolved once per request in the `resolveTrackerRole` middleware and attached to `req.trackerRole`. It defaults to `community_member` if no elevated assignment is active. Users with `account_status = 'banned'` or `'restricted'` are rejected with 403 before role resolution.

Permission data lives in the `tracker.permissions` table (seeded at migration time, not user-configurable).

---

## Error Response Shape

All tracker error responses share this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "correlationId": "uuid-v4"
  }
}
```

Standard codes:
- `VALIDATION_ERROR` (422) — request body failed schema validation
- `UNAUTHORIZED` (401) — no valid session
- `FORBIDDEN` (403) — authenticated but insufficient permission
- `NOT_FOUND` (404) — resource does not exist
- `CONFLICT` (409) — e.g. duplicate vote, duplicate identity link
- `INTERNAL_ERROR` (500) — unhandled server error (no detail exposed to client)

---

## Logging

Structured JSON logging via `pino`. Every tracker request produces a log line with: method, path, status code, duration (ms), and correlation id. Correlation ids are assigned at the tracker middleware boundary (UUID per request) and included in all downstream log output for that request.

Log level is configurable via `TRACKER_LOG_LEVEL` environment variable (default: `info`).

User data is never logged. Only user UUIDs appear in log output — never usernames, display names, or email addresses.

HTTP 500 errors log the full stack trace server-side; the client receives only the correlation id and a generic message.

---

## Notification Fanout

Notification fanout is synchronous at this community scale. When a lifecycle event occurs:

1. A `notification_events` row is inserted
2. The notification service queries `ticket_subscriptions` for all subscribed users
3. `user_notifications` rows are inserted for each subscriber (excluding the actor)
4. The Discord outbound webhook fires (fire-and-forget, after transaction commit)

There is no queue. If the process crashes between the transaction commit and the Discord dispatch, the Discord message is lost. This is acceptable at this scale — the audit trail in `ticket_status_history` is always consistent.

---

## Discord Integration Architecture

Two separate Discord integration components:

### Outbound Webhook (server-side, dormant until go-live)

Fires after significant lifecycle events (ticket submitted, status changed). Sends a structured message to the configured mod channel webhook URL. Entirely fire-and-forget — delivery failures are logged to `discord_delivery_log` but do not affect the response to the user or the integrity of the ticket lifecycle.

Activated by setting `DISCORD_MOD_WEBHOOK_URL`.

### Inbound Bot (separate process, dormant until go-live)

A long-lived Discord bot process (`tracker/server/src/bot/index.ts`) that:
- Listens for role changes in the guild and writes to `discord_role_sync_log`
- Exposes a `/token` slash command that links a Discord identity to a hanab.live username
- On successful `/token`: applies any pending role grants from `discord_role_sync_log`

Activated by setting `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, and `DISCORD_MOD_ROLE_NAME`, then redeploying.
