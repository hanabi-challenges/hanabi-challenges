# Auth API

## Scope

Authentication and account lifecycle operations.

## Key Endpoints

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/logout`
- `GET /auth/me`

## Notes

- Existing usernames follow legacy login behavior.
- New registrations may require token orchestration with Hanab Live identity verification.
- Token/cookie session should remain consistent across page reload.
