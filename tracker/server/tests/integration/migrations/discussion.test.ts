import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTestDatabaseUrl, setupTestSchema, teardownTestSchema } from '../../support/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseMigration(filePath: string): { up: string; down: string } {
  const content = readFileSync(filePath, 'utf8');
  const [upRaw, downRaw] = content.split('-- Down Migration');
  if (!upRaw || !downRaw) throw new Error('Migration missing Up or Down section');
  return {
    up: upRaw.replace('-- Up Migration', '').trim(),
    down: downRaw.trim(),
  };
}

const testDbUrl = getTestDatabaseUrl();
const migrationsDir = join(__dirname, '../../../migrations');

const migrations = [
  '20260327000000_core_lookup_tables.sql',
  '20260327120000_users.sql',
  '20260327140000_tickets.sql',
  '20260327160000_lifecycle.sql',
  '20260327180000_discussion.sql',
].map((f) => parseMigration(join(migrationsDir, f)));

describe('migration: 20260327180000_discussion', () => {
  let sql: postgres.Sql;
  let ticketId: string;
  let userId: string;
  let userId2: string;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2, connection: { search_path: 'tracker' } });
    await setupTestSchema(sql);
    for (const { up } of migrations) {
      await sql.unsafe(up);
    }

    const [submitted] = await sql<{ id: number }[]>`
      SELECT id FROM statuses WHERE slug = 'submitted'
    `;
    const [bugType] = await sql<{ id: number }[]>`
      SELECT id FROM ticket_types WHERE slug = 'bug'
    `;
    const [gameplay] = await sql<{ id: number }[]>`
      SELECT id FROM domains WHERE slug = 'gameplay'
    `;
    if (!submitted || !bugType || !gameplay) throw new Error('seed data missing');

    const [u1] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name) VALUES ('alice', 'Alice') RETURNING id
    `;
    const [u2] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name) VALUES ('bob', 'Bob') RETURNING id
    `;
    if (!u1 || !u2) throw new Error('user insert failed');
    userId = u1.id;
    userId2 = u2.id;

    const [ticket] = await sql<{ id: string }[]>`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
      VALUES ('Test ticket', 'desc', ${bugType.id}, ${gameplay.id}, ${userId}, ${submitted.id})
      RETURNING id
    `;
    if (!ticket) throw new Error('ticket insert failed');
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── ticket_comments ──────────────────────────────────────────────────────────

  it('creates a public comment and reads it back', async () => {
    await sql`
      INSERT INTO ticket_comments (ticket_id, author_id, body)
      VALUES (${ticketId}, ${userId}, 'Great idea!')
    `;
    const rows = await sql<{ body: string; is_internal: boolean }[]>`
      SELECT body, is_internal FROM ticket_comments WHERE ticket_id = ${ticketId}
    `;
    expect(rows[0]?.body).toBe('Great idea!');
    expect(rows[0]?.is_internal).toBe(false);
  });

  it('creates an internal comment', async () => {
    await sql`
      INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal)
      VALUES (${ticketId}, ${userId}, 'Mod note.', TRUE)
    `;
    const rows = await sql<{ is_internal: boolean }[]>`
      SELECT is_internal FROM ticket_comments
      WHERE ticket_id = ${ticketId} AND is_internal = TRUE
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.is_internal).toBe(true);
  });

  it('rejects a comment referencing a non-existent ticket', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(
      sql`INSERT INTO ticket_comments (ticket_id, author_id, body)
          VALUES (${fakeId}, ${userId}, 'Orphan')`,
    ).rejects.toThrow();
  });

  // ── ticket_votes ─────────────────────────────────────────────────────────────

  it('allows a user to vote once', async () => {
    await sql`
      INSERT INTO ticket_votes (ticket_id, user_id) VALUES (${ticketId}, ${userId})
    `;
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM ticket_votes WHERE ticket_id = ${ticketId}
    `;
    expect(Number(row?.count)).toBe(1);
  });

  it('rejects a duplicate vote from the same user', async () => {
    await expect(
      sql`INSERT INTO ticket_votes (ticket_id, user_id) VALUES (${ticketId}, ${userId})`,
    ).rejects.toThrow();
  });

  it('allows a second user to vote on the same ticket', async () => {
    await sql`
      INSERT INTO ticket_votes (ticket_id, user_id) VALUES (${ticketId}, ${userId2})
    `;
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM ticket_votes WHERE ticket_id = ${ticketId}
    `;
    expect(Number(row?.count)).toBe(2);
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops discussion tables while leaving tickets', async () => {
    const { down } = migrations[4]!;
    await sql.unsafe(down);

    for (const table of ['ticket_comments', 'ticket_votes']) {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'tracker' AND table_name = ${table}
        ) AS exists
      `;
      expect(row?.exists, `${table} should not exist after rollback`).toBe(false);
    }

    const [ticketsRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'tickets'
      ) AS exists
    `;
    expect(ticketsRow?.exists).toBe(true);

    for (const { down: d } of [...migrations].reverse().slice(1)) {
      await sql.unsafe(d);
    }
  });
});
