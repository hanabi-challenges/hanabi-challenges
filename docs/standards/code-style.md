# Code Style and Atomicity

## Purpose

Define enforceable standards for consistency, maintainability, and atomic design across the monorepo.

## Global Principles

- Keep modules small, named by domain behavior, and composable.
- Prefer explicit types over implicit `any`.
- Keep one responsibility per function/component where practical.
- Avoid mixed concerns (data fetching + heavy rendering + business logic in one unit).

## Atomicity Expectations

- Route/page components orchestrate only.
- Domain logic lives in services/hooks/utilities.
- Reusable UI patterns must be extracted into shared components.
- New features should extend existing atoms/molecules before introducing variants.

## File and Naming Conventions

- `*.service.ts`: domain logic and persistence orchestration.
- `*.routes.ts`: transport concerns only.
- `*.controller.ts`: optional mapping layer when needed.
- `PascalCase.tsx`: React components.
- `camelCase.ts`: utilities/hooks/helpers.

## Frontend Rules

- Use Mantine components for layout/input primitives by default.
- Keep custom CSS scoped and purposeful.
- Use feature APIs/hooks for network calls; avoid fetch logic spread across leaf components.

## Backend Rules

- Validate incoming payloads.
- Keep DB access transactional for multi-step state changes.
- Normalize errors to user-safe and operator-usable messages.

## Mandatory Checks Before Merge

- `pnpm -C apps/web run lint`
- `pnpm -C apps/api run lint`
- `pnpm run build`
- Relevant tests for changed domain
