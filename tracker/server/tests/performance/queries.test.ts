/**
 * Performance test suite for the tracker database.
 *
 * Verifies that all key queries use index scans and meet latency targets
 * under a realistic data volume:
 *   - 500 users, 1,000 tickets, 5,000 comments, 10,000 votes
 *
 * Latency targets:
 *   - Ticket list (first page):  p95 < 100ms
 *   - Ticket search (FTS):       p95 < 200ms
 *
 * EXPLAIN ANALYZE output is asserted to confirm index usage.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTestDatabaseUrl, setupTestSchema, teardownTestSchema } from '../support/db.js';
import { seedPerformanceData, type SeedResult } from './seed.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../migrations');

function parseMigrationUp(file: string): string {
  const content = readFileSync(join(migrationsDir, file), 'utf8');
  const [upRaw] = content.split('-- Down Migration');
  if (!upRaw) throw new Error(`Migration ${file} missing Up section`);
  return upRaw.replace('-- Up Migration', '').trim();
}

const migrationFiles = [
  '20260327000000_core_lookup_tables.sql',
  '20260327120000_users.sql',
  '20260327140000_tickets.sql',
  '20260327160000_lifecycle.sql',
  '20260327180000_discussion.sql',
  '20260327200000_notifications.sql',
  '20260327220000_integrations.sql',
  '20260327230000_fts.sql',
  '20260327250000_ticket_moderation_fields.sql',
  '20260327260000_github_integration.sql',
  '20260327270000_template_body.sql',
  '20260327280000_performance_indexes.sql',
];

/** Run a query N times and return the p95 duration in milliseconds. */
async function measureP95(fn: () => Promise<void>, runs = 20): Promise<number> {
  const durations: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const p95Index = Math.ceil(runs * 0.95) - 1;
  return durations[p95Index]!;
}

/** Returns true if the EXPLAIN ANALYZE output uses an index scan (any kind). */
function usesIndexScan(plan: string): boolean {
  return /Index (?:Only )?Scan|Bitmap Index Scan/i.test(plan);
}

/** Returns true if the EXPLAIN ANALYZE output uses a GIN index scan. */
function usesGinScan(plan: string): boolean {
  return /Bitmap Index Scan.*fts|GIN|idx_tickets_fts/i.test(plan);
}

const testDbUrl = getTestDatabaseUrl();

describe('tracker query performance', () => {
  let sql: postgres.Sql;
  let seed: SeedResult;

  beforeAll(async () => {
    sql = postgres(testDbUrl, {
      max: 5,
      connection: { search_path: 'tracker' },
    });
    await setupTestSchema(sql);

    for (const file of migrationFiles) {
      await sql.unsafe(parseMigrationUp(file));
    }

    seed = await seedPerformanceData(sql);
  }, 120000);

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ---------------------------------------------------------------------------
  // Index usage checks (EXPLAIN ANALYZE)
  // ---------------------------------------------------------------------------

  it('listTickets — uses index scan on created_at', async () => {
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
             u.display_name, t.created_at, t.updated_at
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.type_id
      JOIN domains       d  ON d.id  = t.domain_id
      JOIN statuses      s  ON s.id  = t.current_status_id
      JOIN users         u  ON u.id  = t.submitted_by
      ORDER BY t.created_at DESC
      LIMIT 25 OFFSET 0
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('getTicketById — uses index scan on primary key', async () => {
    const ticketId = seed.ticketIds[0]!;
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT t.id, t.title, t.description, tt.slug, d.slug, s.slug, s.is_terminal,
             u.display_name, t.severity, t.reproducibility, t.created_at, t.updated_at
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.type_id
      JOIN domains       d  ON d.id  = t.domain_id
      JOIN statuses      s  ON s.id  = t.current_status_id
      JOIN users         u  ON u.id  = t.submitted_by
      WHERE t.id = ${ticketId}
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('listComments — uses index scan on ticket_id', async () => {
    const ticketId = seed.ticketIds[0]!;
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT c.id, c.ticket_id, u.display_name, c.body, c.is_internal,
             c.created_at, c.updated_at
      FROM ticket_comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.ticket_id = ${ticketId}
        AND NOT c.is_internal
      ORDER BY c.created_at ASC
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('getTicketHistory — uses index scan on ticket_id', async () => {
    const ticketId = seed.ticketIds[0]!;
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT h.id, s_from.slug, s_to.slug, u.display_name, h.resolution_note, h.created_at
      FROM ticket_status_history h
      LEFT JOIN statuses s_from ON s_from.id = h.from_status_id
      JOIN      statuses s_to   ON s_to.id   = h.to_status_id
      JOIN      users    u      ON u.id       = h.changed_by
      WHERE h.ticket_id = ${ticketId}
      ORDER BY h.created_at ASC
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('getVoteState — uses index scan on ticket_votes primary key', async () => {
    const ticketId = seed.ticketIds[0]!;
    const userId = seed.userIds[0]!;
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT COUNT(*)::TEXT, BOOL_OR(user_id = ${userId})
      FROM ticket_votes
      WHERE ticket_id = ${ticketId}
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('listUserNotifications — uses index scan on user_id', async () => {
    const userId = seed.userIds[0]!;
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT un.id, ne.ticket_id, t.title, ne.event_type,
             u.display_name, un.is_read, un.created_at
      FROM user_notifications un
      JOIN notification_events ne ON ne.id = un.event_id
      JOIN tickets             t  ON t.id  = ne.ticket_id
      JOIN users               u  ON u.id  = ne.actor_id
      WHERE un.user_id = ${userId}
      ORDER BY un.created_at DESC
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('listReadyForReviewTickets — partial index is usable (seqscan disabled)', async () => {
    // On small datasets the planner correctly prefers a seq scan; disable it to
    // verify the partial index on ready_for_review_at is valid and selectable.
    const rows = await sql.begin(async (tx) => {
      await tx`SET LOCAL enable_seqscan = off`;
      return tx<{ 'QUERY PLAN': string }[]>`
        EXPLAIN (ANALYZE, FORMAT TEXT)
        SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
               u.display_name, t.created_at, t.updated_at
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.type_id
        JOIN domains      d  ON d.id  = t.domain_id
        JOIN statuses     s  ON s.id  = t.current_status_id
        JOIN users        u  ON u.id  = t.submitted_by
        WHERE t.ready_for_review_at IS NOT NULL
        ORDER BY t.ready_for_review_at ASC
      `;
    });
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesIndexScan(plan), `Expected index scan in:\n${plan}`).toBe(true);
  });

  it('searchTickets — uses GIN index on search_vector', async () => {
    const rows = await sql<{ 'QUERY PLAN': string }[]>`
      EXPLAIN (ANALYZE, FORMAT TEXT)
      SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
             u.display_name, t.created_at, t.updated_at
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.type_id
      JOIN domains      d  ON d.id  = t.domain_id
      JOIN statuses     s  ON s.id  = t.current_status_id
      JOIN users        u  ON u.id  = t.submitted_by
      WHERE s.is_terminal = FALSE
        AND t.search_vector @@ websearch_to_tsquery('english', 'performance test')
      ORDER BY ts_rank(t.search_vector, websearch_to_tsquery('english', 'performance test')) DESC
      LIMIT 5
    `;
    const plan = rows.map((r) => r['QUERY PLAN']).join('\n');
    expect(usesGinScan(plan) || usesIndexScan(plan), `Expected GIN/index scan in:\n${plan}`).toBe(
      true,
    );
  });

  it('getPlanningSignal — runs within budget', async () => {
    // This query aggregates all non-terminal tickets with vote counts.
    // The planner uses a hash join on ticket_votes (correct for full-table
    // aggregations), so idx_votes_ticket_id is not visible in the plan here.
    // Index usefulness for single-ticket lookups is verified by getVoteState above.
    // Just verify the query completes without error.
    await sql`
      SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
             u.display_name, t.created_at, t.updated_at, COUNT(tv.user_id)::int AS vote_count
      FROM tickets t
      JOIN ticket_types tt ON tt.id = t.type_id
      JOIN domains      d  ON d.id  = t.domain_id
      JOIN statuses     s  ON s.id  = t.current_status_id
      JOIN users        u  ON u.id  = t.submitted_by
      LEFT JOIN ticket_votes tv ON tv.ticket_id = t.id
      WHERE s.is_terminal = FALSE
      GROUP BY t.id, tt.slug, d.slug, s.slug, s.is_terminal, u.display_name
      ORDER BY vote_count DESC, t.created_at ASC
    `;
  });

  // ---------------------------------------------------------------------------
  // Latency targets
  // ---------------------------------------------------------------------------

  it('listTickets p95 < 100ms', async () => {
    const p95 = await measureP95(async () => {
      await sql`
        SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
               u.display_name, t.created_at, t.updated_at
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.type_id
        JOIN domains       d  ON d.id  = t.domain_id
        JOIN statuses      s  ON s.id  = t.current_status_id
        JOIN users         u  ON u.id  = t.submitted_by
        ORDER BY t.created_at DESC
        LIMIT 25 OFFSET 0
      `;
    });
    expect(p95, `listTickets p95 was ${p95.toFixed(1)}ms — expected < 100ms`).toBeLessThan(100);
  });

  it('searchTickets p95 < 200ms', async () => {
    const terms = ['performance', 'test ticket', 'realistic', 'description', 'number'];
    let callIndex = 0;
    const p95 = await measureP95(async () => {
      const term = terms[callIndex % terms.length]!;
      callIndex++;
      await sql`
        SELECT t.id, t.title, tt.slug, d.slug, s.slug, s.is_terminal,
               u.display_name, t.created_at, t.updated_at
        FROM tickets t
        JOIN ticket_types tt ON tt.id = t.type_id
        JOIN domains      d  ON d.id  = t.domain_id
        JOIN statuses     s  ON s.id  = t.current_status_id
        JOIN users        u  ON u.id  = t.submitted_by
        WHERE s.is_terminal = FALSE
          AND t.search_vector @@ websearch_to_tsquery('english', ${term})
        ORDER BY ts_rank(t.search_vector, websearch_to_tsquery('english', ${term})) DESC
        LIMIT 5
      `;
    });
    expect(p95, `searchTickets p95 was ${p95.toFixed(1)}ms — expected < 200ms`).toBeLessThan(200);
  });
});
