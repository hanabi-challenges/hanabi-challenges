# <Endpoint Group>: <Operation>

## Route

- Method: `GET|POST|PUT|PATCH|DELETE`
- Path: `/api/...`
- Auth: None | User | Admin | Superadmin

## Request

### Path Params

- `param`: description

### Query Params

- `param`: description

### Body

```json
{}
```

## Response

### Success (`2xx`)

```json
{}
```

### Errors (`4xx`/`5xx`)

- `400`: validation failure
- `401`: unauthorized
- `403`: forbidden
- `404`: not found
- `409`: conflict

## Notes

Behavioral edge cases, idempotency, or side effects.
