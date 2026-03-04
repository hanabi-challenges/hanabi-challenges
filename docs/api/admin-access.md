# Admin Access Request API

## Scope

Request/review lifecycle for granting admin access.

## Key Endpoints (Representative)

- `POST /admin-access/requests`
- `GET /admin-access/requests`
- `POST /admin-access/requests/:id/approve`
- `POST /admin-access/requests/:id/deny`

## Policy

- Request action control should be limited by role policy (superadmin preferred authority).
- Requester receives state-change notification.
- Non-actionable requests should not remain in actionable queues.
