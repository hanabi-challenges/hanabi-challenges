import { pool } from '../../config/db';

let adminAccessSchemaEnsured = false;

export type AdminAccessRequestStatus = 'pending' | 'approved' | 'denied';

export type AdminAccessRequest = {
  id: number;
  requester_user_id: number;
  reason: string | null;
  status: AdminAccessRequestStatus;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  created_at: string;
};

export async function ensureAdminAccessSchema(): Promise<void> {
  if (adminAccessSchemaEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_access_requests (
      id SERIAL PRIMARY KEY,
      requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason TEXT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending',
      reviewed_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_admin_access_requests_requester_created
      ON admin_access_requests (requester_user_id, created_at DESC, id DESC)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_access_requests_pending_per_user
      ON admin_access_requests (requester_user_id)
      WHERE status = 'pending'
  `);

  adminAccessSchemaEnsured = true;
}

export async function getLatestRequestForUser(userId: number): Promise<AdminAccessRequest | null> {
  await ensureAdminAccessSchema();
  const result = await pool.query<AdminAccessRequest>(
    `
    SELECT
      id,
      requester_user_id,
      reason,
      status,
      reviewed_by_user_id,
      reviewed_at,
      created_at
    FROM admin_access_requests
    WHERE requester_user_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `,
    [userId],
  );
  return result.rowCount ? result.rows[0] : null;
}

export async function createAdminAccessRequest(input: {
  requesterUserId: number;
  reason: string | null;
}): Promise<AdminAccessRequest> {
  await ensureAdminAccessSchema();

  const requester = await pool.query<{ roles: string[] }>(
    `
    SELECT roles
    FROM users
    WHERE id = $1
    `,
    [input.requesterUserId],
  );

  if (!requester.rowCount) {
    const err = new Error('USER_NOT_FOUND');
    (err as { code?: string }).code = 'USER_NOT_FOUND';
    throw err;
  }
  const roles: string[] = requester.rows[0].roles ?? ['USER'];
  if (roles.some((r) => r !== 'USER')) {
    const err = new Error('ALREADY_ADMIN');
    (err as { code?: string }).code = 'ALREADY_ADMIN';
    throw err;
  }

  try {
    const result = await pool.query<AdminAccessRequest>(
      `
      INSERT INTO admin_access_requests (
        requester_user_id,
        reason,
        status
      )
      VALUES ($1, $2, 'pending')
      RETURNING
        id,
        requester_user_id,
        reason,
        status,
        reviewed_by_user_id,
        reviewed_at,
        created_at
      `,
      [input.requesterUserId, input.reason],
    );

    return result.rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      const pending = await pool.query<AdminAccessRequest>(
        `
        SELECT
          id,
          requester_user_id,
          reason,
          status,
          reviewed_by_user_id,
          reviewed_at,
          created_at
        FROM admin_access_requests
        WHERE requester_user_id = $1
          AND status = 'pending'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        `,
        [input.requesterUserId],
      );
      const dupeError = new Error('PENDING_EXISTS');
      (dupeError as { code?: string; pending?: AdminAccessRequest | null }).code = 'PENDING_EXISTS';
      (dupeError as { pending?: AdminAccessRequest | null }).pending =
        pending.rowCount > 0 ? pending.rows[0] : null;
      throw dupeError;
    }
    throw err;
  }
}
