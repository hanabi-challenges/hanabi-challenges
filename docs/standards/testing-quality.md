# Testing and Quality Standards

## Testing Pyramid (Canonical)

- Unit tests: pure logic and UI component behavior.
- Integration tests: API/DB/realtime behavior with realistic boundaries.
- E2E tests: top-level smoke coverage via Playwright.

## Canonical Commands

- Full local test run:
  - `pnpm run ci:tests`
- Layered runs:
  - `pnpm run test:unit`
  - `pnpm run test:integration`
  - `pnpm run test:e2e`
- Workspace-specific:
  - `pnpm -C apps/api run test:unit`
  - `pnpm -C apps/api run test:integration`
  - `pnpm -C apps/web run test:unit`

## Canonical Locations

- Repo tooling/unit checks: `tests/unit/tooling/`
- API unit tests: `apps/api/tests/unit/`
- API integration tests: `apps/api/tests/integration/`
- API test helpers: `apps/api/tests/support/` and `apps/api/tests/factories/`
- Web unit tests: `apps/web/tests/unit/`
- E2E tests (Playwright): `tests/e2e/`

## Quality Gates

- Lint clean
- Build clean
- Unit tests pass
- Integration tests pass for backend/stateful changes
- E2E smoke passes before release
