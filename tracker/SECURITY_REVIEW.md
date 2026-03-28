# Tracker Security Review

Conducted: 2026-03-27
Scope: tracker server backend (`tracker/server/`) and tracker client frontend (`tracker/client/`)

---

## Checklist

### SQL Injection

**Result: PASS**

All database queries use the `postgres.js` tagged-template literal syntax exclusively:

```typescript
await sql`SELECT * FROM tickets WHERE id = ${ticketId}`;
```

The tagged-template library parameterises every interpolated value automatically. There is no string concatenation of user input into SQL queries anywhere in the codebase. Verified by searching for `sql(` (non-template usage) and raw string construction — none found.

---

### Authentication Bypass

**Result: PASS**

Every non-public tracker API route is protected by `requireTrackerAuth`. The two public routes (`GET /tracker/health` and `GET /tracker/health/db`) are intentionally unauthenticated and return no user data.

An automated unit test (`tests/unit/security.test.ts`) sends unauthenticated requests to all protected API endpoints and asserts 401 responses. This test runs in CI on every push.

---

### CSRF Protection

**Result: PASS**

The tracker API uses JSON request bodies exclusively. CORS is handled by the main site's configuration. Because all state-changing requests require `Content-Type: application/json` and read the request body (rather than URL parameters), they cannot be forged via a same-origin HTML form. The tracker does not use cookies for its own authentication — it relies on the main site's session, which the main site is responsible for CSRF-protecting.

---

### Input Validation

**Result: PASS**

Request bodies are validated at the route handler level before any database operation:
- `title`, `description`, `type_id`, `domain_id` validated in `POST /tracker/api/tickets`
- `to_status` validated in `PATCH /tracker/api/tickets/:id/status`
- `body` validated and length-limited in `PUT /tracker/api/templates/:type_slug`
- `canonical_ticket_id` validated in `POST /tracker/api/tickets/:id/duplicate`
- `q` validated (non-empty, length-limited) in `GET /tracker/api/tickets/search`

Environment variables validated at startup via `zod` schema (`src/env.ts`). Missing required variables crash fast with a descriptive error.

---

### Sensitive Data Exposure

**Result: PASS**

- **GitHub bot token**: never logged. The `GITHUB_BOT_TOKEN` value appears only in the `Authorization` header of outbound API calls. Errors from GitHub API responses log only the HTTP status and error body text — not the token.
- **GitHub webhook secret**: never logged. `validateGithubSignature` computes the expected signature internally; the secret value is not included in any log output.
- **Discord bot token**: never logged. The token is used only by `discord.js` internally. Startup logs confirm bot activation without logging the token value.
- **hanab.live token values**: The `/token` Discord slash command value is never logged or stored. The handler validates the token with the hanab.live API and immediately discards the value after resolving the username.
- **API error responses**: correlation IDs are UUID values with no user information. Display names and usernames are included in responses only where explicitly required by the API contract (e.g. ticket detail view). Actor UUIDs — never display names — are used in all log output.

---

### Webhook Signature Validation

**Result: PASS**

`POST /tracker/api/webhooks/github` validates the HMAC-SHA256 signature (from `X-Hub-Signature-256`) before any processing or database write occurs. Invalid signatures return 401 and are not logged. The signature check uses `timingSafeEqual` to prevent timing attacks.

Unit tests in `tests/unit/github.test.ts` cover: valid signature, tampered body, wrong secret, missing header, bad prefix, and empty body.

---

### Discord Bot Token

**Result: PASS**

See Sensitive Data Exposure above. The bot token is consumed by `discord.js` and never appears in log output, API responses, or error messages.

---

### hanab.live Token Values

**Result: PASS**

See Sensitive Data Exposure above. Token values are never persisted or logged. The bot responds ephemerally (visible only to the invoking user) and does not echo the token value in any response.

---

### Dependency Audit

**Result: CONDITIONAL PASS**

`pnpm audit` from the repo root reports 25 vulnerabilities. All are in the **existing repo's packages** — none are in tracker-specific packages:

- `apps/web > happy-dom` (critical — VM context escape): dev-only test dependency in the main site's test suite
- `packages/hanabi-live-game > ts-jest > handlebars` (critical): dev-only test dependency

The tracker production packages (`@tracker/server`, `@tracker/client`, `@tracker/types`) have no high or critical findings.

**Action required before go-live:** Resolve or accept the existing repo's dependency findings. These are pre-existing issues outside the tracker scope and should be addressed by the main site's maintainers as a separate effort.

Run `pnpm audit --filter @tracker/server --filter @tracker/client --filter @tracker/types` to confirm tracker-specific packages remain clean.

---

## Identified Issues and Resolutions

None identified during this review.

---

## Post-Launch Actions

- Schedule `pnpm audit` as a weekly CI job
- Re-run this checklist after any significant dependency upgrade or new endpoint addition
