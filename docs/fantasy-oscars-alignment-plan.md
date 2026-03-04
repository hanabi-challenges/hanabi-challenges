# Hanabi -> Fantasy Oscars Alignment Plan

## Goals

1. Adopt the proven monorepo conventions from `fantasy-oscars`.
2. Standardize package management and runtime constraints (`pnpm`, Node engines).
3. Establish a clear testing pyramid (unit first, integration explicitly opt-in).
4. Fix local developer onboarding so `install -> dev -> test -> build` works reliably.

## Migration Status (Updated February 27, 2026)

- Completed: pnpm workspace migration, test split, and local bootstrap fixes.
- Completed: structural move to `apps/api`, `apps/web`, and `packages/shared`.
- Remaining: incremental adoption of shared package usage and deeper CI quality gates.

## Current Baseline (February 27, 2026)

- Repo already has separate `backend/` and `frontend/`, but no workspace management.
- Root scripts were npm-centric and referenced missing tooling (`npm-run-all`).
- Dev infra wrappers in `infra/dev/` were empty and broke local bootstrap.
- Backend tests were all integration tests, failing immediately without `DATABASE_URL`.
- Frontend had no `test` script.

## Target State (Modeled after `fantasy-oscars`)

- Root-managed workspace using `pnpm-workspace.yaml`.
- `packageManager` + `engines` declared at root.
- Root scripts orchestrate package-level scripts via pnpm filtering/workspace semantics.
- Test split:
  - `test` defaults to fast/local-safe unit suite.
  - `test:integration` runs DB-backed backend checks.
- Local dev bootstrap is scriptable and deterministic (`infra/dev/start-dev-env.sh`).

## Phase Plan

### Phase 1: Toolchain Foundation

- Add `pnpm-workspace.yaml` for `backend` and `frontend`.
- Set root `packageManager` and `engines`.
- Replace npm-only orchestration with pnpm-compatible scripts.
- Remove dependency on undeclared orchestration tools where possible.

### Phase 2: Testing Strategy Alignment

- Introduce backend Vitest split configs:
  - `vitest.unit.config.ts`
  - `vitest.integration.config.ts`
- Make root `test` run unit/default tests only.
- Add explicit root/backend integration commands.
- Add missing frontend test scripts and baseline pass-with-no-tests behavior until coverage exists.

### Phase 3: Local Environment Reliability

- Implement `infra/dev/start-dev-env.sh`, `infra/dev/check-docker.sh`, and `infra/dev/seed-dev-env.sh`.
- Fix DB reset scripts to reference canonical SQL paths in `backend/db/`.
- Add `backend/.env.example` and update README onboarding.

### Phase 4: Structural Convergence with `fantasy-oscars`

- Migrate from top-level `backend/`, `frontend/` to `apps/api`, `apps/web`.
- Introduce `packages/shared` for shared types and cross-runtime utilities.
- Update imports and TypeScript pathing to consume shared package explicitly.
- Normalize script naming across packages (`dev`, `build`, `test`, `typecheck`, `lint`, `format`).

### Phase 5: CI and Quality Bar Upgrade

- Add root CI composition scripts similar to `fantasy-oscars`:
  - `test:format`, `test:lint`, `test:typecheck`, `test:unit`, `test:integration`, `test:build`.
- Ensure CI uses pnpm lockfile and workspace commands.
- Add docs checks and link validation once docs footprint stabilizes.

## Success Criteria

- `pnpm install` succeeds at repo root.
- `pnpm run dev` boots DB, seeds schema/data, and runs backend+frontend.
- `pnpm run test` succeeds without requiring DB credentials.
- `pnpm run test:backend:integration` succeeds with local DB bootstrap.
- `pnpm run build` succeeds for both backend and frontend.
