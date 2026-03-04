# Release Runbook

## Pre-Release Checklist

1. `pnpm run lint`
2. `pnpm run test`
3. `pnpm run build`
4. `pnpm run test:api:integration` (for backend stateful changes)

## Manual QA Checklist

- Event index and event detail render in both themes
- League admin rail controls function
- Ready-check + start-game flow works end-to-end
- Badge designer save/save-as works with uniqueness checks
- Notifications bell updates in real time

## Deployment

- Container/Kubernetes scripts under `infra/prod/`
- Validate required env vars before rollout
