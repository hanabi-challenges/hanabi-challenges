# Events API

## Scope

Event CRUD, publication, metadata, and event-page state.

## Key Endpoints (Representative)

- `GET /events`
- `GET /events/:slug`
- `POST /events`
- `PATCH /events/:id`
- `DELETE /events/:id`

## Event Formats

- `challenge`
- `tournament`
- `session_ladder` (UI label: League)

## Ownership

- Creator is stored as event owner (`owner_user_id`).
- Server checks owner/delegate/superadmin for management operations.
