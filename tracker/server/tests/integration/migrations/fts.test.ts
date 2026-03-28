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
  '20260327200000_notifications.sql',
  '20260327220000_integrations.sql',
  '20260327230000_fts.sql',
].map((f) => parseMigration(join(migrationsDir, f)));

describe('migration: 20260327230000_fts', () => {
  let sql: postgres.Sql;
  let userId: string;
  let bugTypeId: number;
  let gameplayDomainId: number;
  let submittedStatusId: number;

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
    submittedStatusId = submitted.id;
    bugTypeId = bugType.id;
    gameplayDomainId = gameplay.id;

    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name) VALUES ('alice', 'Alice') RETURNING id
    `;
    if (!user) throw new Error('user insert failed');
    userId = user.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  it('populates search_vector automatically on insert', async () => {
    await sql`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
      VALUES ('Scoring bug', 'Scores calculated incorrectly after overtime',
              ${bugTypeId}, ${gameplayDomainId}, ${userId}, ${submittedStatusId})
    `;
    const [row] = await sql<{ search_vector: string }[]>`
      SELECT search_vector::TEXT FROM tickets WHERE title = 'Scoring bug'
    `;
    expect(row?.search_vector).toContain('score');
  });

  it('finds a ticket by title keyword', async () => {
    const rows = await sql<{ title: string }[]>`
      SELECT title FROM tickets
      WHERE search_vector @@ plainto_tsquery('english', 'scoring')
    `;
    expect(rows.some((r) => r.title === 'Scoring bug')).toBe(true);
  });

  it('finds a ticket by description keyword', async () => {
    const rows = await sql<{ title: string }[]>`
      SELECT title FROM tickets
      WHERE search_vector @@ plainto_tsquery('english', 'overtime')
    `;
    expect(rows.some((r) => r.title === 'Scoring bug')).toBe(true);
  });

  it('does not find a ticket for an unrelated keyword', async () => {
    const rows = await sql<{ title: string }[]>`
      SELECT title FROM tickets
      WHERE search_vector @@ plainto_tsquery('english', 'elephant')
    `;
    expect(rows).toHaveLength(0);
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops the search_vector column and index', async () => {
    const { down } = migrations[7]!;
    await sql.unsafe(down);

    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'tracker'
          AND table_name = 'tickets'
          AND column_name = 'search_vector'
      ) AS exists
    `;
    expect(row?.exists).toBe(false);

    // tickets table itself should still exist.
    const [tableRow] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'tickets'
      ) AS exists
    `;
    expect(tableRow?.exists).toBe(true);

    for (const { down: d } of [...migrations].reverse().slice(1)) {
      await sql.unsafe(d);
    }
  });
});
