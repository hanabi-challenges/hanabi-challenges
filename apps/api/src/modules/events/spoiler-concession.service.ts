import { pool } from '../../config/db';

let spoilerConcessionTableEnsured = false;

async function ensureSpoilerConcessionTable(): Promise<void> {
  if (spoilerConcessionTableEnsured) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_spoiler_concessions (
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (event_id, user_id)
    )
  `);
  spoilerConcessionTableEnsured = true;
}

export async function concedeEventSpoilers(input: {
  eventId: number;
  userId: number;
  reason?: string | null;
}): Promise<void> {
  await ensureSpoilerConcessionTable();
  const reason =
    input.reason && input.reason.trim().length > 0 ? input.reason.trim().slice(0, 255) : null;
  await pool.query(
    `
    INSERT INTO event_spoiler_concessions (event_id, user_id, reason)
    VALUES ($1, $2, $3)
    ON CONFLICT (event_id, user_id)
    DO UPDATE SET reason = COALESCE(event_spoiler_concessions.reason, EXCLUDED.reason)
    `,
    [input.eventId, input.userId, reason],
  );
}

export async function hasConcededEventSpoilers(input: {
  eventId: number;
  userId: number;
}): Promise<boolean> {
  await ensureSpoilerConcessionTable();
  const result = await pool.query(
    `
    SELECT 1
    FROM event_spoiler_concessions
    WHERE event_id = $1 AND user_id = $2
    `,
    [input.eventId, input.userId],
  );
  return result.rowCount > 0;
}
