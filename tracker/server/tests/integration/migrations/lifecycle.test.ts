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
].map((f) => parseMigration(join(migrationsDir, f)));

describe('migration: 20260327160000_lifecycle', () => {
  let sql: postgres.Sql;
  let ticketId: string;
  let userId: string;
  let submittedStatusId: number;
  let triagedStatusId: number;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2, connection: { search_path: 'tracker' } });
    await setupTestSchema(sql);
    for (const { up } of migrations) {
      await sql.unsafe(up);
    }

    // Resolve seed data.
    const [submitted] = await sql<{ id: number }[]>`
      SELECT id FROM statuses WHERE slug = 'submitted'
    `;
    const [triaged] = await sql<{ id: number }[]>`
      SELECT id FROM statuses WHERE slug = 'triaged'
    `;
    const [bugType] = await sql<{ id: number }[]>`
      SELECT id FROM ticket_types WHERE slug = 'bug'
    `;
    const [gameplay] = await sql<{ id: number }[]>`
      SELECT id FROM domains WHERE slug = 'gameplay'
    `;
    if (!submitted || !triaged || !bugType || !gameplay) {
      throw new Error('seed data missing');
    }
    submittedStatusId = submitted.id;
    triagedStatusId = triaged.id;

    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name)
      VALUES ('alice', 'Alice')
      RETURNING id
    `;
    if (!user) throw new Error('user insert failed');
    userId = user.id;

    const [ticket] = await sql<{ id: string }[]>`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
      VALUES ('Test ticket', 'desc', ${bugType.id}, ${gameplay.id}, ${userId}, ${submittedStatusId})
      RETURNING id
    `;
    if (!ticket) throw new Error('ticket insert failed');
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  it('records an initial status history row with null from_status', async () => {
    await sql`
      INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by)
      VALUES (${ticketId}, NULL, ${submittedStatusId}, ${userId})
    `;
    const [row] = await sql<{ from_status_id: number | null; to_status_id: number }[]>`
      SELECT from_status_id, to_status_id
      FROM ticket_status_history
      WHERE ticket_id = ${ticketId}
    `;
    expect(row?.from_status_id).toBeNull();
    expect(row?.to_status_id).toBe(submittedStatusId);
  });

  it('records a status transition with a resolution note', async () => {
    await sql`
      INSERT INTO ticket_status_history
        (ticket_id, from_status_id, to_status_id, changed_by, resolution_note)
      VALUES (${ticketId}, ${submittedStatusId}, ${triagedStatusId}, ${userId}, 'Looks valid.')
    `;
    const rows = await sql<{ to_status_id: number; resolution_note: string | null }[]>`
      SELECT to_status_id, resolution_note
      FROM ticket_status_history
      WHERE ticket_id = ${ticketId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    expect(rows[0]?.to_status_id).toBe(triagedStatusId);
    expect(rows[0]?.resolution_note).toBe('Looks valid.');
  });

  it('rejects a history row referencing a non-existent ticket', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    await expect(
      sql`INSERT INTO ticket_status_history (ticket_id, to_status_id, changed_by)
          VALUES (${fakeId}, ${submittedStatusId}, ${userId})`,
    ).rejects.toThrow();
  });

  it('down migration drops ticket_status_history while leaving tickets', async () => {
    const { down } = migrations[3]!;
    await sql.unsafe(down);

    const [histRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'ticket_status_history'
      ) AS exists
    `;
    expect(histRow?.exists).toBe(false);

    const [ticketsRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'tickets'
      ) AS exists
    `;
    expect(ticketsRow?.exists).toBe(true);

    // Clean up in reverse order.
    for (const { down: d } of [...migrations].reverse().slice(1)) {
      await sql.unsafe(d);
    }
  });
});
