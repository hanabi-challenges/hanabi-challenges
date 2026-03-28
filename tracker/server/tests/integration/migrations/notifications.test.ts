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
].map((f) => parseMigration(join(migrationsDir, f)));

describe('migration: 20260327200000_notifications', () => {
  let sql: postgres.Sql;
  let ticketId: string;
  let userId: string;
  let userId2: string;
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
      VALUES ('Test', 'desc', ${bugType.id}, ${gameplay.id}, ${userId}, ${submitted.id})
      RETURNING id
    `;
    if (!ticket) throw new Error('ticket insert failed');
    ticketId = ticket.id;
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  // ── ticket_subscriptions ─────────────────────────────────────────────────────

  it('subscribes a user to a ticket', async () => {
    await sql`
      INSERT INTO ticket_subscriptions (ticket_id, user_id) VALUES (${ticketId}, ${userId})
    `;
    const [row] = await sql<{ count: string }[]>`
      SELECT count(*) FROM ticket_subscriptions WHERE ticket_id = ${ticketId}
    `;
    expect(Number(row?.count)).toBe(1);
  });

  it('rejects a duplicate subscription', async () => {
    await expect(
      sql`INSERT INTO ticket_subscriptions (ticket_id, user_id) VALUES (${ticketId}, ${userId})`,
    ).rejects.toThrow();
  });

  // ── notification_events ──────────────────────────────────────────────────────

  it('inserts a notification event', async () => {
    const [event] = await sql<{ id: string }[]>`
      INSERT INTO notification_events (ticket_id, event_type, actor_id)
      VALUES (${ticketId}, 'status_changed', ${userId})
      RETURNING id
    `;
    expect(event?.id).toBeDefined();
    if (!event) throw new Error('event insert failed');
    eventId = event.id;
  });

  // ── user_notifications ───────────────────────────────────────────────────────

  it('delivers a notification to a subscriber', async () => {
    await sql`
      INSERT INTO user_notifications (user_id, event_id) VALUES (${userId2}, ${eventId})
    `;
    const [row] = await sql<{ is_read: boolean }[]>`
      SELECT is_read FROM user_notifications WHERE user_id = ${userId2} AND event_id = ${eventId}
    `;
    expect(row?.is_read).toBe(false);
  });

  it('rejects a duplicate user_notification for the same event', async () => {
    await expect(
      sql`INSERT INTO user_notifications (user_id, event_id) VALUES (${userId2}, ${eventId})`,
    ).rejects.toThrow();
  });

  it('marks a notification as read', async () => {
    await sql`
      UPDATE user_notifications SET is_read = TRUE
      WHERE user_id = ${userId2} AND event_id = ${eventId}
    `;
    const [row] = await sql<{ is_read: boolean }[]>`
      SELECT is_read FROM user_notifications WHERE user_id = ${userId2} AND event_id = ${eventId}
    `;
    expect(row?.is_read).toBe(true);
  });

  // ── rollback ─────────────────────────────────────────────────────────────────

  it('down migration drops all three notification tables', async () => {
    const { down } = migrations[5]!;
    await sql.unsafe(down);

    for (const table of ['user_notifications', 'notification_events', 'ticket_subscriptions']) {
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
