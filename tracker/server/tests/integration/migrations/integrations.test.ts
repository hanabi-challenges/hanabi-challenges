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
].map((f) => parseMigration(join(migrationsDir, f)));

describe('migration: 20260327220000_integrations', () => {
  let sql: postgres.Sql;
  let userId: string;
  let eventId: string;

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

    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name) VALUES ('alice', 'Alice') RETURNING id
    `;
    if (!user) throw new Error('user insert failed');
    userId = user.id;

    const [ticket] = await sql<{ id: string }[]>`
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id)
      VALUES ('Test', 'desc', ${bugType.id}, ${gameplay.id}, ${userId}, ${submitted.id})
      RETURNING id
    `;
    if (!ticket) throw new Error('ticket insert failed');

    const [event] = await sql<{ id: string }[]>`
      INSERT INTO notification_events (ticket_id, event_type, actor_id)
      VALUES (${ticket.id}, 'status_changed', ${userId})
      RETURNING id
    `;
    if (!event) throw new Error('event insert failed');
    eventId = event.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── discord_identities ───────────────────────────────────────────────────────

  it('links a Discord identity to a user', async () => {
    await sql`
      INSERT INTO discord_identities (user_id, discord_user_id, discord_username)
      VALUES (${userId}, '123456789', 'alice#1234')
    `;
    const [row] = await sql<{ discord_username: string }[]>`
      SELECT discord_username FROM discord_identities WHERE user_id = ${userId}
    `;
    expect(row?.discord_username).toBe('alice#1234');
  });

  it('rejects a second Discord identity for the same user', async () => {
    await expect(
      sql`INSERT INTO discord_identities (user_id, discord_user_id, discord_username)
          VALUES (${userId}, '999999999', 'alice_alt#5678')`,
    ).rejects.toThrow();
  });

  it('rejects the same discord_user_id linked to a different user', async () => {
    const [u2] = await sql<{ id: string }[]>`
      INSERT INTO users (hanablive_username, display_name) VALUES ('bob', 'Bob') RETURNING id
    `;
    if (!u2) throw new Error('user insert failed');
    await expect(
      sql`INSERT INTO discord_identities (user_id, discord_user_id, discord_username)
          VALUES (${u2.id}, '123456789', 'alice#1234')`,
    ).rejects.toThrow();
  });

  // ── discord_delivery_log ─────────────────────────────────────────────────────

  it('logs a successful delivery', async () => {
    await sql`
      INSERT INTO discord_delivery_log (event_id, status, http_status)
      VALUES (${eventId}, 'success', 204)
    `;
    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM discord_delivery_log WHERE event_id = ${eventId}
    `;
    expect(row?.status).toBe('success');
  });

  it('logs a failed delivery with an error', async () => {
    await sql`
      INSERT INTO discord_delivery_log (event_id, status, http_status, error)
      VALUES (${eventId}, 'failure', 500, 'Internal Server Error')
    `;
    const rows = await sql<{ status: string }[]>`
      SELECT status FROM discord_delivery_log WHERE event_id = ${eventId} ORDER BY attempted_at
    `;
    expect(rows).toHaveLength(2);
    expect(rows[1]?.status).toBe('failure');
  });

  it('rejects an invalid delivery status', async () => {
    await expect(
      sql`INSERT INTO discord_delivery_log (status) VALUES ('pending')`,
    ).rejects.toThrow();
  });

  // ── discord_role_sync_log ────────────────────────────────────────────────────

  it('records a pending role grant from Discord', async () => {
    await sql`
      INSERT INTO discord_role_sync_log (discord_user_id, discord_role_name, event_type)
      VALUES ('123456789', 'Moderator', 'granted')
    `;
    const [row] = await sql<{ applied: boolean }[]>`
      SELECT applied FROM discord_role_sync_log
      WHERE discord_user_id = '123456789' AND applied = FALSE
    `;
    expect(row?.applied).toBe(false);
  });

  it('marks a sync log entry as applied', async () => {
    await sql`
      UPDATE discord_role_sync_log SET applied = TRUE
      WHERE discord_user_id = '123456789' AND discord_role_name = 'Moderator'
    `;
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM discord_role_sync_log
      WHERE discord_user_id = '123456789' AND applied = FALSE
    `;
    expect(Number(row?.count)).toBe(0);
  });

  it('rejects an invalid event_type', async () => {
    await expect(
      sql`INSERT INTO discord_role_sync_log (discord_user_id, discord_role_name, event_type)
          VALUES ('999', 'Mod', 'changed')`,
    ).rejects.toThrow();
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops all three integration tables', async () => {
    const { down } = migrations[6]!;
    await sql.unsafe(down);

    for (const table of ['discord_identities', 'discord_delivery_log', 'discord_role_sync_log']) {
      const [row] = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'tracker' AND table_name = ${table}
        ) AS exists
      `;
      expect(row?.exists, `${table} should not exist after rollback`).toBe(false);
    }

    for (const { down: d } of [...migrations].reverse().slice(1)) {
      await sql.unsafe(d);
    }
  });
});
