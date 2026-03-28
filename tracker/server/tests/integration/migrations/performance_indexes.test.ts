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

const prerequisiteFiles = [
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
];

const prerequisites = prerequisiteFiles.map((f) => parseMigration(join(migrationsDir, f)));
const { up: upPerf, down: downPerf } = parseMigration(
  join(migrationsDir, '20260327280000_performance_indexes.sql'),
);

describe('migration: 20260327280000_performance_indexes', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2, connection: { search_path: 'tracker' } });
    await setupTestSchema(sql);
    for (const { up } of prerequisites) {
      await sql.unsafe(up);
    }
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  it('applies up migration without error', async () => {
    await expect(sql.unsafe(upPerf)).resolves.not.toThrow();
  });

  it('creates idx_tickets_ready_for_review partial index', async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'tracker' AND tablename = 'tickets'
        AND indexname = 'idx_tickets_ready_for_review'
    `;
    expect(rows).toHaveLength(1);
  });

  it('creates idx_votes_ticket_id index', async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'tracker' AND tablename = 'ticket_votes'
        AND indexname = 'idx_votes_ticket_id'
    `;
    expect(rows).toHaveLength(1);
  });

  it('rolls back without error', async () => {
    await expect(sql.unsafe(downPerf)).resolves.not.toThrow();
  });

  it('removes both indexes after rollback', async () => {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'tracker'
        AND indexname IN ('idx_tickets_ready_for_review', 'idx_votes_ticket_id')
    `;
    expect(rows).toHaveLength(0);
  });
});
