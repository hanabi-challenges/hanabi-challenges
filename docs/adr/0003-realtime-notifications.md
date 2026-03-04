# ADR 0003: Realtime Notifications via WebSocket

## Status

Accepted

## Decision

Introduce site-wide websocket channel for logged-in users to receive notification updates.

## Rationale

- Notification bell is globally visible.
- Polling across all pages is inefficient and less responsive.

## Consequences

- Websocket lifecycle managed in shared layout context.
- API must support event emission and read-state reconciliation.
- Non-actionable items should be removed or downgraded promptly.
