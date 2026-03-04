# Backend API Standards

## Route Design

- Group routes by domain under `src/modules/<domain>`.
- Use pluralized resource-style route naming where possible.
- Keep route handlers thin; defer business logic to services.

## Response Shape

- Success payloads should be deterministic and typed.
- Error responses should include HTTP status and concise actionable message.
- Validation errors should be distinguishable from conflict/state errors.

## Auth and Authorization

- Protected routes require JWT bearer auth.
- Role checks must be centralized and explicit.
- Ownership/delegation checks must be enforced server-side even if UI hides controls.

## Transactions

Use transactions for:

- Multi-table writes
- Round/session finalization
- Badge award + notification side effects

## Idempotency

Operational actions that may be retried (`finalize`, `start`, `close`) should be idempotent where feasible.
