import type { Sql } from 'postgres';
import type { AccountStatus, RoleSlug } from '@tracker/types';

export interface TrackerUserRow {
  id: string;
  hanablive_username: string;
  display_name: string;
  account_status: AccountStatus;
}

/**
 * Inserts a user on first access; updates display_name on subsequent requests.
 * Uses ON CONFLICT to make the operation idempotent.
 */
export async function upsertTrackerUser(
  sql: Sql,
  hanabLiveUsername: string,
  displayName: string,
): Promise<TrackerUserRow> {
  const rows = await sql<TrackerUserRow[]>`
    INSERT INTO users (hanablive_username, display_name)
    VALUES (${hanabLiveUsername}, ${displayName})
    ON CONFLICT (hanablive_username)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      updated_at   = now()
    RETURNING id, hanablive_username, display_name, account_status
  `;
  const row = rows[0];
  if (!row) throw new Error('upsertTrackerUser: no row returned');
  return row;
}

/**
 * Returns the highest-privilege active role for the given user.
 * Defaults to 'community_member' when no explicit assignment exists.
 * Priority: committee > moderator > community_member.
 */
export async function resolveUserRole(sql: Sql, userId: string): Promise<RoleSlug> {
  const rows = await sql<{ name: string }[]>`
    SELECT r.name
    FROM user_role_assignments ura
    JOIN roles r ON r.id = ura.role_id
    WHERE ura.user_id = ${userId}
      AND ura.revoked_at IS NULL
  `;
  if (rows.some((r) => r.name === 'committee')) return 'committee';
  if (rows.some((r) => r.name === 'moderator')) return 'moderator';
  return 'community_member';
}
