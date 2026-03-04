# Users API

## Scope

User profile data, role metadata, user listing/search, password updates.

## Key Endpoints (Representative)

- `GET /users/:id`
- `GET /users/by-name/:displayName`
- `PATCH /users/:id/password`
- Directory/list endpoints for admin and participant selection

## Profile Surfaces

- Overview and settings pages consume profile metadata.
- Events and badges subpages consume user-centric aggregations.
