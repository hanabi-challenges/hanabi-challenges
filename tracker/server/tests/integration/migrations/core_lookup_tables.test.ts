import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getTestDatabaseUrl, setupTestSchema, teardownTestSchema } from '../../support/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(
  __dirname,
  '../../../migrations/20260327000000_core_lookup_tables.sql',
);

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
const { up, down } = parseMigration(migrationPath);

describe('migration: 20260327000000_core_lookup_tables', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2 });
    await setupTestSchema(sql);
    await sql.unsafe(up);
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── ticket_types ────────────────────────────────────────────────────────────

  it('creates ticket_types with all expected slugs', async () => {
    const rows = await sql<{ slug: string }[]>`SELECT slug FROM ticket_types ORDER BY sort_order`;
    expect(rows.map((r) => r.slug)).toEqual([
      'bug',
      'feature_request',
      'question',
      'feedback',
      'other',
    ]);
  });

  // ── domains ─────────────────────────────────────────────────────────────────

  it('creates domains with all expected slugs', async () => {
    const rows = await sql<{ slug: string }[]>`SELECT slug FROM domains ORDER BY sort_order`;
    expect(rows.map((r) => r.slug)).toEqual([
      'gameplay',
      'scoring',
      'registration',
      'interface',
      'matchmaking',
      'events',
      'discord',
      'other',
    ]);
  });

  // ── statuses ─────────────────────────────────────────────────────────────────

  it('creates statuses with correct slugs and terminal flags', async () => {
    const rows = await sql<
      {
        slug: string;
        is_terminal: boolean;
      }[]
    >`SELECT slug, is_terminal FROM statuses ORDER BY id`;

    const terminal = rows.filter((r) => r.is_terminal).map((r) => r.slug);
    const nonTerminal = rows.filter((r) => !r.is_terminal).map((r) => r.slug);

    expect(terminal.sort()).toEqual(['closed', 'rejected', 'resolved']);
    expect(nonTerminal.sort()).toEqual(['decided', 'in_review', 'submitted', 'triaged']);
  });

  // ── roles ────────────────────────────────────────────────────────────────────

  it('creates exactly three roles', async () => {
    const rows = await sql<{ name: string }[]>`SELECT name FROM roles ORDER BY id`;
    expect(rows.map((r) => r.name)).toEqual(['community_member', 'moderator', 'committee']);
  });

  // ── valid_transitions ────────────────────────────────────────────────────────

  it('seeds valid_transitions for moderator and committee only', async () => {
    const rows = await sql<{ role_name: string }[]>`
      SELECT DISTINCT r.name AS role_name
      FROM valid_transitions vt
      JOIN roles r ON r.id = vt.role_id
      ORDER BY r.name
    `;
    expect(rows.map((r) => r.role_name)).toEqual(['committee', 'moderator']);
  });

  it('allows moderator to triage submitted tickets', async () => {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM valid_transitions vt
      JOIN statuses s_from ON s_from.id = vt.from_status_id
      JOIN statuses s_to   ON s_to.id   = vt.to_status_id
      JOIN roles r         ON r.id       = vt.role_id
      WHERE s_from.slug = 'submitted'
        AND s_to.slug   = 'triaged'
        AND r.name      = 'moderator'
    `;
    expect(Number(row?.count)).toBe(1);
  });

  it('does not allow community_member any transitions', async () => {
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM valid_transitions vt
      JOIN roles r ON r.id = vt.role_id
      WHERE r.name = 'community_member'
    `;
    expect(Number(row?.count)).toBe(0);
  });

  it('rejects a self-transition (check constraint)', async () => {
    const statusRows = await sql<{ status_id: number }[]>`
      SELECT id AS status_id FROM statuses WHERE slug = 'submitted'
    `;
    const roleRows = await sql<{ role_id: number }[]>`
      SELECT id AS role_id FROM roles WHERE name = 'moderator'
    `;
    const statusId = statusRows[0]?.status_id;
    const roleId = roleRows[0]?.role_id;
    if (statusId === undefined || roleId === undefined) throw new Error('seed data missing');
    await expect(
      sql`INSERT INTO valid_transitions (from_status_id, to_status_id, role_id)
          VALUES (${statusId}, ${statusId}, ${roleId})`,
    ).rejects.toThrow();
  });

  // ── permissions ──────────────────────────────────────────────────────────────

  it('grants ticket.create to all roles', async () => {
    const rows = await sql<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM permissions p
      JOIN roles r ON r.id = p.role_id
      WHERE p.action = 'ticket.create'
      ORDER BY r.name
    `;
    expect(rows.map((r) => r.role_name)).toEqual(['committee', 'community_member', 'moderator']);
  });

  it('grants ticket.decide only to committee', async () => {
    const rows = await sql<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM permissions p
      JOIN roles r ON r.id = p.role_id
      WHERE p.action = 'ticket.decide'
    `;
    expect(rows.map((r) => r.role_name)).toEqual(['committee']);
  });

  it('grants user.role.assign only to committee', async () => {
    const rows = await sql<{ role_name: string }[]>`
      SELECT r.name AS role_name
      FROM permissions p
      JOIN roles r ON r.id = p.role_id
      WHERE p.action = 'user.role.assign'
    `;
    expect(rows.map((r) => r.role_name)).toEqual(['committee']);
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops all tables', async () => {
    await sql.unsafe(down);

    for (const table of [
      'permissions',
      'valid_transitions',
      'roles',
      'statuses',
      'domains',
      'ticket_types',
    ]) {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'tracker' AND table_name = ${table}
        ) AS exists
      `;
      expect(row?.exists, `${table} should not exist after rollback`).toBe(false);
    }
  });
});
