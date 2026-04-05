import type { Sql } from 'postgres';
import type { RoleSlug } from '@tracker/types';

/**
 * Assigns a role to a user.
 *
 * Returns 'already_assigned' if the user already has this role active.
 * Returns 'role_not_found' if the slug doesn't match a known role.
 */
export async function assignRole(
  sql: Sql,
  userId: string,
  roleSlug: RoleSlug,
  grantedBy: number,
): Promise<{ ok: true } | { ok: false; reason: 'already_assigned' | 'role_not_found' }> {
  const [role] = await sql<{ id: number }[]>`
    SELECT id FROM roles WHERE name = ${roleSlug}
  `;
  if (!role) return { ok: false, reason: 'role_not_found' };

  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) return { ok: false, reason: 'role_not_found' };

  const rows = await sql<{ id: string }[]>`
    INSERT INTO tracker_role_assignments (user_id, role_id, granted_by)
    VALUES (${numericUserId}, ${role.id}, ${grantedBy})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (rows.length === 0) return { ok: false, reason: 'already_assigned' };
  return { ok: true };
}

/**
 * Revokes the active assignment of a role from a user.
 *
 * Returns false if no active assignment was found.
 */
export async function revokeRole(
  sql: Sql,
  userId: string,
  roleSlug: RoleSlug,
  revokedBy: number,
): Promise<{ ok: true } | { ok: false; reason: 'not_assigned' | 'role_not_found' }> {
  const [role] = await sql<{ id: number }[]>`
    SELECT id FROM roles WHERE name = ${roleSlug}
  `;
  if (!role) return { ok: false, reason: 'role_not_found' };

  const numericUserId = parseInt(userId, 10);
  if (isNaN(numericUserId)) return { ok: false, reason: 'not_assigned' };

  const rows = await sql<{ id: string }[]>`
    UPDATE tracker_role_assignments
    SET revoked_at = now(), revoked_by = ${revokedBy}
    WHERE user_id = ${numericUserId}
      AND role_id = ${role.id}
      AND revoked_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) return { ok: false, reason: 'not_assigned' };
  return { ok: true };
}
