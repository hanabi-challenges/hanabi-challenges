import { pool } from '../../config/db';

export type EventAdminRole = 'OWNER' | 'ADMIN';

export type EventAdminRow = {
  user_id: number;
  display_name: string;
  role: EventAdminRole;
  granted_by: number | null;
  granted_at: Date;
};

// Returns the requesting user's role in this event, or null if not an admin.
export async function getEventAdminRole(
  eventId: number,
  userId: number,
): Promise<EventAdminRole | null> {
  const result = await pool.query<{ role: EventAdminRole }>(
    `SELECT role FROM event_admins WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId],
  );
  return result.rows[0]?.role ?? null;
}

export async function listEventAdmins(eventId: number): Promise<EventAdminRow[]> {
  const result = await pool.query<EventAdminRow>(
    `SELECT ea.user_id, u.display_name, ea.role, ea.granted_by, ea.granted_at
     FROM event_admins ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id = $1
     ORDER BY ea.role DESC, u.display_name`,
    [eventId],
  );
  return result.rows;
}

export async function addEventAdmin(
  eventId: number,
  userId: number,
  grantedBy: number,
): Promise<EventAdminRow | null> {
  // Check the target user exists
  const userCheck = await pool.query<{ id: number; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id = $1`,
    [userId],
  );
  if (userCheck.rowCount === 0) return null;

  await pool.query(
    `INSERT INTO event_admins (event_id, user_id, role, granted_by)
     VALUES ($1, $2, 'ADMIN', $3)
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [eventId, userId, grantedBy],
  );

  const result = await pool.query<EventAdminRow>(
    `SELECT ea.user_id, u.display_name, ea.role, ea.granted_by, ea.granted_at
     FROM event_admins ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id = $1 AND ea.user_id = $2`,
    [eventId, userId],
  );
  return result.rows[0] ?? null;
}

// Change an admin's role. Ownership transfer is atomic: if newRole is OWNER,
// the current OWNER is demoted to ADMIN in the same transaction.
export async function changeEventAdminRole(
  eventId: number,
  targetUserId: number,
  newRole: EventAdminRole,
): Promise<EventAdminRow | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (newRole === 'OWNER') {
      // Demote current OWNER to ADMIN
      await client.query(
        `UPDATE event_admins SET role = 'ADMIN' WHERE event_id = $1 AND role = 'OWNER'`,
        [eventId],
      );
    }

    const result = await client.query<{ user_id: number }>(
      `UPDATE event_admins SET role = $1 WHERE event_id = $2 AND user_id = $3 RETURNING user_id`,
      [newRole, eventId, targetUserId],
    );

    if ((result.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const updated = await pool.query<EventAdminRow>(
    `SELECT ea.user_id, u.display_name, ea.role, ea.granted_by, ea.granted_at
     FROM event_admins ea
     JOIN users u ON u.id = ea.user_id
     WHERE ea.event_id = $1 AND ea.user_id = $2`,
    [eventId, targetUserId],
  );
  return updated.rows[0] ?? null;
}

export async function removeEventAdmin(eventId: number, targetUserId: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM event_admins WHERE event_id = $1 AND user_id = $2`, [
    eventId,
    targetUserId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
