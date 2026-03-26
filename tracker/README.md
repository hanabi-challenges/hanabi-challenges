# Tracker

A community feedback tracker for the Hanabi Competitions site. Community members can submit tickets (bugs, ideas, feedback), moderators triage them, and committee members make decisions. Integrated with Discord for identity linking and notifications.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — structural conventions, non-negotiable invariants, architecture decisions
- [PUBLISHING.md](./PUBLISHING.md) — branch strategy, commit conventions, merge policy, go-live procedures

## Relationship to the Main Repo

The tracker lives at `tracker/` in the root of the `hanabi-challenges` monorepo. It is a distinct package with its own server (`tracker/server`), client (`tracker/client`), and shared types (`tracker/types`). It shares the repo's:

- Package manager (pnpm)
- Toolchain (TypeScript, ESLint, Prettier, Vitest)
- Design system (imported directly from the existing site packages)
- CI pipeline (tracker jobs are added to the existing workflow)

It does **not** share tables, routes, or authentication code with the main site — it integrates with them.

## Package Layout

```
tracker/
├── server/         ← Node.js/Express backend
│   ├── src/
│   │   ├── routes/
│   │   ├── db/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── migrations/
│   │   └── bot/
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── client/         ← React/Vite frontend
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── types/          ← shared request/response contracts
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── ARCHITECTURE.md
├── PUBLISHING.md
└── README.md       ← this file
```

## Setup

### Prerequisites

- Node.js 22.x
- pnpm 10.x
- PostgreSQL 15+

### Install

```bash
# From repo root
pnpm install
```

### Environment Variables

Copy `tracker/server/.env.example` to `tracker/server/.env` and fill in the values. Required variables are described in that file.

### Database

```bash
# Run all pending tracker migrations
pnpm tracker:db:migrate

# Roll back the most recent tracker migration
pnpm tracker:db:rollback

# Reset (drop, recreate, re-migrate) — development only
pnpm tracker:db:reset
```

### Development

```bash
# Start tracker server in dev mode (watch + reload)
pnpm tracker:dev:server

# Start tracker client in dev mode (Vite HMR)
pnpm tracker:dev:client

# Start both
pnpm tracker:dev
```

### Tests

```bash
# Type-check all tracker packages
pnpm tracker:typecheck

# Lint all tracker packages
pnpm tracker:lint

# Unit tests
pnpm tracker:test:unit

# Integration tests (requires a running test database)
pnpm tracker:test:integration
```

### Build

```bash
pnpm tracker:build
```

## Authentication

The tracker authenticates users via the existing site's session. When a user makes a request to a tracker API endpoint:

1. The tracker auth middleware reads the hanab.live username from the existing session (attached to `req.user.hanabLiveUsername` by the main site's auth middleware)
2. The tracker does a lookup/upsert on `tracker.users` by `hanablive_username`
3. The resolved tracker user is attached to `req.trackerUser`

No separate login is required — users authenticate through the main site as they do today.

## Environment Variables Reference

See `tracker/server/.env.example` for the full list. Key variables:

| Variable | Description |
|---|---|
| `TRACKER_DATABASE_URL` | PostgreSQL connection string for the tracker schema |
| `TRACKER_DATABASE_POOL_SIZE` | Max connection pool size (default: 10) |
| `TRACKER_PORT` | Port for the tracker server (if running as a separate process) |
| `TRACKER_LOG_LEVEL` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` (default: `info`) |
| `TRACKER_DATABASE_SSL` | Set to `true` for SSL database connections in production |
| `DISCORD_MOD_WEBHOOK_URL` | Discord webhook URL for mod channel notifications (activates outbound webhook) |
| `DISCORD_BOT_TOKEN` | Discord bot token (activates bot process) |
| `DISCORD_GUILD_ID` | Discord guild/server ID |
| `DISCORD_MOD_ROLE_NAME` | Name of the Discord role that maps to tracker `moderator` role |
