# Realtime Architecture

## Channels

- Site-wide notifications channel (active for logged-in users).
- Session ladder live state channel(s) for active event/session contexts.

## Transport

- Native WebSocket endpoints on API server.
- Vite dev proxy configured to forward websocket traffic in local development.

## Event Model

- Server emits domain events (ready checks, round state, notification changes).
- Clients subscribe, update local state, and reconcile with REST when needed.

## Reliability Strategy

- Reconnect with backoff on transient disconnect.
- Idempotent server handlers.
- REST fallback for definitive refresh after critical actions.

## Security

- Authenticated socket/session required.
- Events scoped to authorized user/event/session contexts.
