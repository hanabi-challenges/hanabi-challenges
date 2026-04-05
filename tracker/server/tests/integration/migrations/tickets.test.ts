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
const { up: upLookup, down: downLookup } = parseMigration(
  join(migrationsDir, '20260327000000_core_lookup_tables.sql'),
);
const { up: upUsers, down: downUsers } = parseMigration(
  join(migrationsDir, '20260327120000_users.sql'),
);
const { up: upTickets, down: downTickets } = parseMigration(
  join(migrationsDir, '20260327140000_tickets.sql'),
);

describe('migration: 20260327140000_tickets', () => {
  let sql: postgres.Sql;

  // Seed IDs resolved after lookup tables are applied.
  let bugTypeId: number;
  let gameplayDomainId: number;
  let submittedStatusId: number;
  let userId: string;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2, connection: { search_path: 'tracker' } });
    await setupTestSchema(sql);
    await sql.unsafe(upLookup);
    await sql.unsafe(upUsers);
    await sql.unsafe(upTickets);

    // Resolve seed IDs from lookup tables.
    const [bugType] = await sql<{ id: number }[]>`
      SELECT id FROM ticket_types WHERE slug = 'bug'
    `;
    const [gameplayDomain] = await sql<{ id: number }[]>`
      SELECT id FROM domains WHERE slug = 'gameplay'
    `;
    const [submittedStatus] = await sql<{ id: number }[]>`
      SELECT id FROM statuses WHERE slug = 'submitted'
    `;
    if (!bugType || !gameplayDomain || !submittedStatus) {
      throw new Error('lookup seed data missing');
    }
    bugTypeId = bugType.id;
    gameplayDomainId = gameplayDomain.id;
    submittedStatusId = submittedStatus.id;

    // Insert a test user.
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name)
      VALUES ('alice', 'Alice')
      RETURNING id
    `;
    if (!user) throw new Error('user insert failed');
    userId = user.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── tickets ──────────────────────────────────────────────────────────────────

  it('creates a ticket and reads it back', async () => {
    const [ticket] = await sql<
      {
        id: string;
        title: string;
        current_status_id: number;
      }[]
    >`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
      VALUES ('Test bug', 'Something broke', ${bugTypeId}, ${gameplayDomainId}, ${userId}, ${submittedStatusId})
      RETURNING id, title, current_status_id
    `;
    expect(ticket?.title).toBe('Test bug');
    expect(ticket?.current_status_id).toBe(submittedStatusId);
  });

  it('rejects a ticket with an invalid severity value', async () => {
    await expect(
      sql`INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id, severity)
          VALUES ('Bad', 'bad', ${bugTypeId}, ${gameplayDomainId}, ${userId}, ${submittedStatusId}, 'critical')`,
    ).rejects.toThrow();
  });

  it('rejects a ticket with an invalid reproducibility value', async () => {
    await expect(
      sql`INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id, reproducibility)
          VALUES ('Bad', 'bad', ${bugTypeId}, ${gameplayDomainId}, ${userId}, ${submittedStatusId}, 'never')`,
    ).rejects.toThrow();
  });

  it('accepts valid severity and reproducibility values', async () => {
    const [ticket] = await sql<{ id: string }[]>`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id, severity, reproducibility)
      VALUES ('Bug with details', 'details', ${bugTypeId}, ${gameplayDomainId}, ${userId}, ${submittedStatusId}, 'functional', 'sometimes')
      RETURNING id
    `;
    expect(ticket?.id).toBeDefined();
  });

  it('rejects a ticket referencing a non-existent user', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000';
    await expect(
      sql`INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
          VALUES ('Orphan', 'no user', ${bugTypeId}, ${gameplayDomainId}, ${fakeUserId}, ${submittedStatusId})`,
    ).rejects.toThrow();
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops the tickets table and its indexes', async () => {
    await sql.unsafe(downTickets);

    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'tickets'
      ) AS exists
    `;
    expect(row?.exists).toBe(false);

    // Users and lookup tables should still be present.
    const [usersRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'users'
      ) AS exists
    `;
    expect(usersRow?.exists).toBe(true);

    // Clean up for afterAll.
    await sql.unsafe(downUsers);
    await sql.unsafe(downLookup);
  });
});
