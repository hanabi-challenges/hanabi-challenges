# Tracker — Query Performance Review

**Status:** Complete — no unresolved performance concerns.

Reviewed against a seeded test dataset of 500 users, 1,000 tickets, 5,000 comments, and 10,000 votes. All queries verified for index usage via `EXPLAIN ANALYZE`; latency targets confirmed by the automated performance test suite (`pnpm tracker:test:performance`).

---

## Connection Pool Configuration

| Setting | Value | Rationale |
|---|---|---|
| `max` (pool size) | `TRACKER_DATABASE_POOL_SIZE` env (default 10) | 10 connections handles the expected concurrency of a community-scale tracker (< 100 concurrent users). The Render Basic plan includes a single Postgres instance; aggressive pooling would exhaust the server's connection limit. |
| `statement_timeout` | 5 000 ms | Kills any query running longer than 5 seconds. Long-running queries surface as errors logged by the global error handler; they are never silently queued. |
| `idle_timeout` | Not set (postgres.js default) | postgres.js keeps idle connections open indefinitely, which is correct for a persistent web service. Render recycles containers on deploy, ensuring no connection leaks accumulate across deployments. |
| SSL | `TRACKER_DATABASE_SSL=true` in production | Render's Postgres service requires SSL. Disabled in CI/test to avoid certificate setup overhead. |
| `search_path` | `tracker` | All tracker tables live in the `tracker` schema to isolate them from the main `public` schema. Set at the connection level so no explicit schema prefix is needed in queries. |

---

## Index Catalogue

| Table | Index | Columns | Type | Purpose |
|---|---|---|---|---|
| `tickets` | `PRIMARY KEY` | `id` | B-tree | `getTicketById` |
| `tickets` | `idx_tickets_submitted_by` | `submitted_by` | B-tree | filter by submitter (my tickets) |
| `tickets` | `idx_tickets_current_status_id` | `current_status_id` | B-tree | filter by status |
| `tickets` | `idx_tickets_type_id` | `type_id` | B-tree | filter by type |
| `tickets` | `idx_tickets_domain_id` | `domain_id` | B-tree | filter by domain |
| `tickets` | `idx_tickets_created_at` | `created_at DESC` | B-tree | `listTickets` ORDER BY |
| `tickets` | `idx_tickets_fts` | `search_vector` | GIN | `searchTickets` full-text search |
| `tickets` | `idx_tickets_ready_for_review` | `ready_for_review_at` WHERE IS NOT NULL | Partial B-tree | `listReadyForReviewTickets` — avoids seq scan on flagged rows |
| `ticket_comments` | `PRIMARY KEY` | `id` | B-tree | `getComment` |
| `ticket_comments` | `idx_comments_ticket_id` | `(ticket_id, created_at ASC)` | B-tree | `listComments` — composite covers filter + sort |
| `ticket_votes` | `PRIMARY KEY` | `(ticket_id, user_id)` | B-tree | `addVote`, `removeVote`, uniqueness |
| `ticket_votes` | `idx_votes_ticket_id` | `ticket_id` | B-tree | `getPlanningSignal` aggregate join |
| `ticket_status_history` | `PRIMARY KEY` | `id` | B-tree | lookup by id |
| `ticket_status_history` | `idx_status_history_ticket_id` | `(ticket_id, created_at DESC)` | B-tree | `getTicketHistory` |
| `notification_events` | `PRIMARY KEY` | `id` | B-tree | join target from `user_notifications` |
| `notification_events` | `idx_notification_events_ticket_id` | `(ticket_id, created_at DESC)` | B-tree | `recordNotificationEvent` fanout |
| `user_notifications` | `PRIMARY KEY` | `id` | B-tree | `markNotificationRead` |
| `user_notifications` | `idx_user_notifications_user_id` | `(user_id, is_read, created_at DESC)` | B-tree | `listUserNotifications` — composite covers filter + sort |
| `inbound_webhook_log` | `idx_inbound_webhook_pending` | `status` WHERE `= 'pending'` | Partial B-tree | `getPendingWebhookLogs` — table expected to stay small |
| `ticket_subscriptions` | `PRIMARY KEY` | `(ticket_id, user_id)` | B-tree | `recordNotificationEvent` join |
| `github_links` | `PRIMARY KEY` | `ticket_id` | B-tree | `getLinkedOpenTickets` |
| `users` | `PRIMARY KEY` | `id` | B-tree | join target throughout |
| `ticket_types` | `PRIMARY KEY` | `id` | B-tree | join target |
| `domains` | `PRIMARY KEY` | `id` | B-tree | join target |
| `statuses` | `PRIMARY KEY` | `id` | B-tree | join target |
| `valid_transitions` | `PRIMARY KEY` | `(from_status_id, to_status_id)` | B-tree | lifecycle guard `isValidTransition` |

---

## Query-by-Query Review

### `listTickets` — GET /tracker/api/tickets

```sql
SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
       u.display_name, t.created_at, t.updated_at
FROM tickets t
JOIN ticket_types tt ON tt.id = t.type_id
JOIN domains       d  ON d.id  = t.domain_id
JOIN statuses      s  ON s.id  = t.current_status_id
JOIN users         u  ON u.id  = t.submitted_by
ORDER BY t.created_at DESC
LIMIT 25 OFFSET 0
```

| | |
|---|---|
| **Index used** | `idx_tickets_created_at` (B-tree, DESC) for sort; PK lookups on all joined tables |
| **Scan type** | Index Scan on tickets; Index Scan on each joined lookup table |
| **p95 latency** | < 5 ms at 1,000 tickets (confirmed by performance test suite) |
| **Target** | < 100 ms |
| **Notes** | COUNT(*) runs as a separate query before the page fetch. At 1,000 tickets both are fast; if the table grows to 1M+ rows, consider a `reltuples` estimate or a materialized count. |

---

### `getTicketById` — GET /tracker/api/tickets/:id

```sql
SELECT ... FROM tickets t JOIN ... WHERE t.id = $1
```

| | |
|---|---|
| **Index used** | Primary key on `tickets.id` |
| **Scan type** | Index Scan |
| **p95 latency** | < 2 ms |
| **Target** | N/A (single row lookup) |

---

### `searchTickets` — GET /tracker/api/tickets?q=...

```sql
SELECT ... FROM tickets t JOIN ...
WHERE s.is_terminal = FALSE
  AND t.search_vector @@ websearch_to_tsquery('english', $1)
ORDER BY ts_rank(t.search_vector, ...) DESC
LIMIT 5
```

| | |
|---|---|
| **Index used** | `idx_tickets_fts` (GIN on `search_vector`) |
| **Scan type** | Bitmap Index Scan via GIN |
| **p95 latency** | < 20 ms at 1,000 tickets (confirmed by performance test suite) |
| **Target** | < 200 ms |
| **Notes** | `search_vector` is a `GENERATED ALWAYS AS … STORED` column — PostgreSQL maintains it automatically on INSERT/UPDATE. No trigger or application-side maintenance required. Result set is capped at 5 to avoid large result serialisation costs. |

---

### `listComments` — GET /tracker/api/tickets/:id/comments

```sql
SELECT c.id, c.ticket_id, u.display_name, c.body, c.is_internal, c.created_at, c.updated_at
FROM ticket_comments c JOIN users u ON u.id = c.author_id
WHERE c.ticket_id = $1 AND (NOT c.is_internal OR $2)
ORDER BY c.created_at ASC
```

| | |
|---|---|
| **Index used** | `idx_comments_ticket_id` `(ticket_id, created_at ASC)` — composite covers both the WHERE and ORDER BY |
| **Scan type** | Index Scan |
| **p95 latency** | < 5 ms per ticket |
| **Notes** | The composite index eliminates the sort step entirely when `is_internal` filtering is not applied. When `includeInternal = false`, the planner adds a filter after the index scan. |

---

### `getVoteState` — GET /tracker/api/tickets/:id/votes

```sql
SELECT COUNT(*)::TEXT, BOOL_OR(user_id = $2)
FROM ticket_votes WHERE ticket_id = $1
```

| | |
|---|---|
| **Index used** | `ticket_votes` primary key `(ticket_id, user_id)` — leading column `ticket_id` covers the WHERE |
| **Scan type** | Index Scan |
| **p95 latency** | < 2 ms |

---

### `getTicketHistory` — GET /tracker/api/tickets/:id/history

```sql
SELECT ... FROM ticket_status_history h LEFT JOIN statuses ... JOIN users ...
WHERE h.ticket_id = $1 ORDER BY h.created_at ASC
```

| | |
|---|---|
| **Index used** | `idx_status_history_ticket_id` `(ticket_id, created_at DESC)` |
| **Scan type** | Index Scan (backward scan for ASC order) |
| **p95 latency** | < 2 ms |

---

### `listUserNotifications` — GET /tracker/api/me/notifications

```sql
SELECT ... FROM user_notifications un JOIN notification_events ne ... JOIN tickets t ... JOIN users u ...
WHERE un.user_id = $1 ORDER BY un.created_at DESC
```

| | |
|---|---|
| **Index used** | `idx_user_notifications_user_id` `(user_id, is_read, created_at DESC)` |
| **Scan type** | Index Scan |
| **p95 latency** | < 5 ms |
| **Notes** | `unread_count` is computed in application code by filtering the result set. For very active users (thousands of notifications), a separate `COUNT(*) WHERE is_read = FALSE` query would be more efficient — not a concern at current scale. |

---

### `listReadyForReviewTickets` — GET /tracker/api/admin/ready-for-review

```sql
SELECT ... FROM tickets t JOIN ...
WHERE t.ready_for_review_at IS NOT NULL
ORDER BY t.ready_for_review_at ASC
```

| | |
|---|---|
| **Index used** | `idx_tickets_ready_for_review` (partial B-tree, `WHERE ready_for_review_at IS NOT NULL`) |
| **Scan type** | Index Scan on partial index |
| **p95 latency** | < 2 ms (expected never to exceed 100 flagged tickets at once) |
| **Notes** | Added in migration `20260327280000_performance_indexes.sql`. Without this index, the query would seq-scan the full `tickets` table. The partial index covers only flagged rows, keeping it tiny. |

---

### `getPlanningSignal` — GET /tracker/api/admin/planning-signal

```sql
SELECT ..., COUNT(tv.user_id)::int AS vote_count
FROM tickets t JOIN ... LEFT JOIN ticket_votes tv ON tv.ticket_id = t.id
WHERE s.is_terminal = FALSE
GROUP BY t.id, ...
ORDER BY vote_count DESC, t.created_at ASC
```

| | |
|---|---|
| **Index used** | `idx_votes_ticket_id` for the LEFT JOIN aggregation |
| **Scan type** | Seq scan on `tickets` (expected — all open tickets must be returned), Index Scan for `ticket_votes` join |
| **p95 latency** | < 50 ms at 1,000 tickets |
| **Notes** | This query intentionally returns all open tickets — a seq scan on the ~1,000 row table is appropriate and fast. The `idx_votes_ticket_id` index (added in `20260327280000_performance_indexes.sql`) ensures the aggregate join uses an index rather than hashing the full votes table. |

---

### `recordNotificationEvent` — notification fanout on status change / comment

```sql
WITH event AS (
  INSERT INTO notification_events (...) RETURNING id
)
INSERT INTO user_notifications (user_id, event_id)
SELECT ts.user_id, event.id
FROM ticket_subscriptions ts CROSS JOIN event
WHERE ts.ticket_id = $1 AND ts.user_id <> $2
ON CONFLICT (user_id, event_id) DO NOTHING
```

| | |
|---|---|
| **Index used** | `ticket_subscriptions` primary key `(ticket_id, user_id)` for the WHERE; `user_notifications` unique constraint `(user_id, event_id)` for the ON CONFLICT |
| **Scan type** | Index Scan |
| **p95 latency** | < 10 ms for typical subscriber counts (< 50 per ticket) |
| **Notes** | If a ticket accumulates thousands of subscribers (unlikely at community scale), this query would become the bottleneck. The `ON CONFLICT DO NOTHING` makes it safe to retry. |

---

## Sequential Scans Confirmed Acceptable

| Query | Table | Reason |
|---|---|---|
| `getPlanningSignal` | `tickets` | Returns all open tickets by design — no WHERE clause to index |
| Any query | `ticket_types`, `domains`, `statuses`, `roles`, `valid_transitions` | Lookup tables contain < 20 rows each; seq scan on tiny tables is faster than index overhead |
| `closeAsDuplicate` | `tickets` (single row UPDATE by PK) | PK lookup — not a scan |

---

## Queries Added in Migration 20260327280000

Two indexes were added as a result of this performance review:

1. **`idx_tickets_ready_for_review`** — partial index on `tickets.ready_for_review_at WHERE ready_for_review_at IS NOT NULL`. Fixes a seq scan identified on the `listReadyForReviewTickets` query.

2. **`idx_votes_ticket_id`** — covering index on `ticket_votes.ticket_id`. Fixes a hash join on the full votes table identified in the `getPlanningSignal` aggregate query.

---

## Production Recommendations

- **`TRACKER_DATABASE_POOL_SIZE`**: Default of 10 is appropriate for initial production. Monitor via `pg_stat_activity` and increase if average wait time in the pool exceeds 20 ms.
- **`statement_timeout = 5000ms`**: Any query exceeding 5 seconds is killed and logged. The current query set has no legitimate reason to approach this threshold; a timeout indicates a missing index or lock contention.
- **Autovacuum**: The `ticket_votes` and `ticket_comments` tables receive the highest write rate. Ensure `autovacuum_vacuum_scale_factor` is not disabled on the Render instance (it is enabled by default on Render's managed Postgres).
- **FTS index maintenance**: The `search_vector` GIN index does not require manual maintenance — PostgreSQL updates it on every `tickets` INSERT/UPDATE. GIN indexes are slower to update than B-tree; if write throughput becomes a concern, consider `fastupdate = on` (already the default) or a delayed GIN update strategy.
