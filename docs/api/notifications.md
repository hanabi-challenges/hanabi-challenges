# Notifications API

## Scope

User notifications feed and read-state management.

## Key Endpoints (Representative)

- `GET /notifications`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

## Realtime

- Server pushes new notifications over websocket.
- Bell indicator in main layout reflects unread count.
- Notification rows disappear/resolve when no longer actionable.
