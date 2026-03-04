# ADR 0001: Role and Permission Model

## Status

Accepted

## Decision

Use role + ownership model:

- `USER`
- `ADMIN`
- `SUPERADMIN`
- Event `owner_user_id`
- Delegate access list for event managers

## Rationale

- Needed for post-initialization league operations.
- Avoid over-permissive global admin controls.

## Consequences

- Server-side checks must enforce owner/delegate boundaries.
- UI can hide controls but cannot be source of authorization.
