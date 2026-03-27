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

const { up: upLookup, down: downLookup } = parseMigration(
  join(__dirname, '../../../migrations/20260327000000_core_lookup_tables.sql'),
);
const { up: upUsers, down: downUsers } = parseMigration(
  join(__dirname, '../../../migrations/20260327120000_users.sql'),
);

describe('migration: 20260327120000_users', () => {
  let sql: postgres.Sql;

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2, connection: { search_path: 'tracker' } });
    await setupTestSchema(sql);
    // Users depends on roles from the core lookup tables migration.
    await sql.unsafe(upLookup);
    await sql.unsafe(upUsers);
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── users ────────────────────────────────────────────────────────────────────

  it('creates a user and retrieves it by hanablive_username', async () => {
    await sql`
      INSERT INTO users (hanablive_username, display_name)
      VALUES ('alice', 'Alice')
    `;
    const rows = await sql<{ display_name: string; account_status: string }[]>`
      SELECT display_name, account_status FROM users WHERE hanablive_username = 'alice'
    `;
    expect(rows[0]?.display_name).toBe('Alice');
    expect(rows[0]?.account_status).toBe('active');
  });

  it('rejects duplicate hanablive_username', async () => {
    await expect(
      sql`INSERT INTO users (hanablive_username, display_name) VALUES ('alice', 'Alice2')`,
    ).rejects.toThrow();
  });

  it('rejects an invalid account_status value', async () => {
    await expect(
      sql`INSERT INTO users (hanablive_username, display_name, account_status)
          VALUES ('bob', 'Bob', 'suspended')`,
    ).rejects.toThrow();
  });

  // ── user_role_assignments ────────────────────────────────────────────────────

  it('assigns a role and reads it back', async () => {
    const [moderatorRole] = await sql<{ id: number }[]>`
      SELECT id FROM roles WHERE name = 'moderator'
    `;
    if (!moderatorRole) throw new Error('moderator role not found');

    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE hanablive_username = 'alice'
    `;
    if (!user) throw new Error('alice not found');

    await sql`
      INSERT INTO user_role_assignments (user_id, role_id)
      VALUES (${user.id}, ${moderatorRole.id})
    `;

    const [assignment] = await sql<{ source: string; revoked_at: Date | null }[]>`
      SELECT source, revoked_at FROM user_role_assignments
      WHERE user_id = ${user.id} AND role_id = ${moderatorRole.id}
    `;
    expect(assignment?.source).toBe('manual');
    expect(assignment?.revoked_at).toBeNull();
  });

  it('rejects a duplicate active role assignment (partial unique index)', async () => {
    const [moderatorRole] = await sql<{ id: number }[]>`
      SELECT id FROM roles WHERE name = 'moderator'
    `;
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE hanablive_username = 'alice'
    `;
    if (!moderatorRole || !user) throw new Error('seed data missing');

    await expect(
      sql`INSERT INTO user_role_assignments (user_id, role_id)
          VALUES (${user.id}, ${moderatorRole.id})`,
    ).rejects.toThrow();
  });

  it('allows a second assignment after revocation', async () => {
    const [moderatorRole] = await sql<{ id: number }[]>`
      SELECT id FROM roles WHERE name = 'moderator'
    `;
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE hanablive_username = 'alice'
    `;
    if (!moderatorRole || !user) throw new Error('seed data missing');

    // Revoke the existing assignment.
    await sql`
      UPDATE user_role_assignments
      SET revoked_at = now()
      WHERE user_id = ${user.id} AND role_id = ${moderatorRole.id} AND revoked_at IS NULL
    `;

    // Now a new active assignment is allowed.
    await sql`
      INSERT INTO user_role_assignments (user_id, role_id)
      VALUES (${user.id}, ${moderatorRole.id})
    `;

    const rows = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_role_assignments
      WHERE user_id = ${user.id} AND role_id = ${moderatorRole.id}
      ORDER BY granted_at
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0]?.revoked_at).not.toBeNull();
    expect(rows[1]?.revoked_at).toBeNull();
  });

  it('rejects an invalid source value', async () => {
    const [user] = await sql<{ id: string }[]>`
      SELECT id FROM users WHERE hanablive_username = 'alice'
    `;
    const [committeeRole] = await sql<{ id: number }[]>`
      SELECT id FROM roles WHERE name = 'committee'
    `;
    if (!user || !committeeRole) throw new Error('seed data missing');

    await expect(
      sql`INSERT INTO user_role_assignments (user_id, role_id, source)
          VALUES (${user.id}, ${committeeRole.id}, 'admin_api')`,
    ).rejects.toThrow();
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops users and user_role_assignments', async () => {
    await sql.unsafe(downUsers);

    for (const table of ['user_role_assignments', 'users']) {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'tracker' AND table_name = ${table}
        ) AS exists
      `;
      expect(row?.exists, `${table} should not exist after rollback`).toBe(false);
    }

    // Lookup tables should still be present.
    const [row] = await sql<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'tracker' AND table_name = 'roles'
      ) AS exists
    `;
    expect(row?.exists).toBe(true);

    // Clean up the rest for afterAll.
    await sql.unsafe(downLookup);
  });
});
