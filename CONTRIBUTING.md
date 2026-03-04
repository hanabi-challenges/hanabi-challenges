# Contributing

## Scope

This project uses a monorepo layout:

- `apps/api` for backend API
- `apps/web` for frontend
- `packages/shared` for shared types/utilities

## Environment Setup

1. Install dependencies:

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

2. Start local stack:

```bash
pnpm run dev
```

## Quality Gates

Run before opening a PR:

```bash
pnpm run lint
pnpm run test
pnpm run build
```

## Documentation Requirements

For behavior changes, update docs in `docs/`:

- architecture and/or API docs for contract changes,
- guides/runbooks for workflow changes,
- ADRs for significant design decisions.

Start from [docs/README.md](./docs/README.md).

## Frontend UI Rules

- Use design-system primitives and wrappers, not ad hoc styles for shared patterns.
- Keep Mantine imports centralized via `apps/web/src/mantine.tsx`.
- Preserve component atomicity: compose page features from reusable units.

## Pull Request Expectations

- Small, reviewable commits.
- Clear description of behavior change.
- Include test and verification notes.
- Include docs updates or an explicit reason for no docs change.
