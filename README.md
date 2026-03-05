# Hanabi Events

Monorepo for running structured Hanabi events (formerly called "challenges"),
tracking teams, and recording game results.

## Documentation

Canonical docs are in [`docs/`](./docs/README.md):

- Architecture
- Standards (code style, atomicity, component consistency)
- API references
- Operations guides and runbooks
- ADRs

Contribution workflow is documented in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Project Structure

- apps/api/ - Node + TypeScript API (Express), PostgreSQL, Vitest tests
- apps/web/ - Vite + React + TypeScript frontend
- packages/shared/ - shared types/utilities for cross-app use
- docker/ - Local dev/test/prod docker-compose definitions
- infra/ - Helper scripts for local/CI/prod execution

## Development

### Prerequisites

- Node.js 22.12.0 (see `.nvmrc`)
- Corepack enabled (`corepack enable`) so pnpm is available
- Docker (recommended for local DB bootstrapping)

### Installing tools

From the repo root:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

### Start locally

```bash
pnpm run dev
```

This runs `infra/dev/start-dev-env.sh` to start Postgres, then launches api + web.
Database reset is opt-in only via `DEV_RESET_DB=1`.

### Linting and formatting

From repo root:

```bash
pnpm run lint          # ESLint (workspace)
pnpm run lint:fix      # ESLint auto-fix
pnpm run format        # Prettier check
pnpm run format:fix    # Prettier apply
```

### Running tests

```bash
pnpm run test                      # unit/default tests only
pnpm run test:api:integration      # DB-backed API integration tests
```

## CI

GitHub Actions workflow runs on push/PR to main:

- Lint (`pnpm run lint`)
- Unit tests (`pnpm run test`)
- Integration tests (`pnpm run test:api:integration`)
