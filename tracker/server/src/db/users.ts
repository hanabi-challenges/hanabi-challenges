import type { Sql } from 'postgres';
import type { AccountStatus, RoleSlug } from '@tracker/types';

export interface MentionUserRow {
  id: number;
  display_name: string;
  color_hex: string;
  text_color: string;
}

export interface TrackerUserRow {
  id: number;
  display_name: string;
  account_status: AccountStatus;
}

export interface UserWithRole {
  id: number;
  display_name: string;
  account_status: AccountStatus;
  role: RoleSlug;
  discord_linked: boolean;
}

/**
 * Looks up the authenticated user in public.users by display_name.
 * Returns null if the user has no account in the main application.
 * Account status is read from tracker_user_settings (defaults to 'active').
 */
export async function findTrackerUser(
  sql: Sql,
  displayName: string,
): Promise<TrackerUserRow | null> {
  const [row] = await sql<{ id: number; display_name: string }[]>`
    SELECT id, display_name
    FROM public.users
    WHERE display_name = ${displayName}
  `;
  if (!row) return null;

  const [settings] = await sql<{ account_status: AccountStatus }[]>`
    SELECT account_status FROM tracker_user_settings WHERE user_id = ${row.id}
  `;

  return {
    id: row.id,
    display_name: row.display_name,
    account_status: settings?.account_status ?? 'active',
  };
}

/**
 * Returns the highest-privilege active role for the given user.
 * Explicit tracker_role_assignments take precedence; if none exist,
 * SUPERADMIN/SITE_ADMIN on the main app implicitly maps to 'committee'.
 * Priority: committee > moderator > community_member.
 */
export async function resolveUserRole(sql: Sql, userId: number): Promise<RoleSlug> {
  const [row] = await sql<{ assignments: string[]; site_roles: string[] }[]>`
    SELECT
      COALESCE(
        ARRAY_AGG(r.name) FILTER (WHERE tra.id IS NOT NULL AND tra.revoked_at IS NULL),
        '{}'
      ) AS assignments,
      COALESCE(u.roles, '{}') AS site_roles
    FROM public.users u
    LEFT JOIN tracker_role_assignments tra ON tra.user_id = u.id
    LEFT JOIN roles r ON r.id = tra.role_id
    WHERE u.id = ${userId}
    GROUP BY u.roles
  `;
  if (!row) return 'community_member';
  if (row.assignments.includes('committee')) return 'committee';
  if (row.assignments.includes('moderator')) return 'moderator';
  // Fall back to main-app roles: SUPERADMIN/SITE_ADMIN → committee
  if (row.site_roles.includes('SUPERADMIN') || row.site_roles.includes('SITE_ADMIN')) {
    return 'committee';
  }
  return 'community_member';
}

/**
 * Searches public.users by display_name prefix for @mention autocomplete.
 * Returns up to 8 results, case-insensitive.
 */
export async function searchUsersForMention(sql: Sql, query: string): Promise<MentionUserRow[]> {
  return sql<MentionUserRow[]>`
    SELECT id, display_name, color_hex, text_color
    FROM public.users
    WHERE display_name ILIKE ${query + '%'}
    ORDER BY display_name
    LIMIT 8
  `;
}

/**
 * Lists all tracker users that have an explicit role assignment or settings row,
 * with their highest-privilege active role and Discord link status.
 * Ordered by role priority (committee first), then by display_name.
 */
export async function listUsersWithRoles(sql: Sql): Promise<UserWithRole[]> {
  return sql<UserWithRole[]>`
    SELECT
      u.id,
      u.display_name,
      COALESCE(tus.account_status, 'active') AS account_status,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM tracker_role_assignments tra
          JOIN roles r ON r.id = tra.role_id
          WHERE tra.user_id = u.id AND tra.revoked_at IS NULL AND r.name = 'committee'
        ) THEN 'committee'
        WHEN EXISTS (
          SELECT 1 FROM tracker_role_assignments tra
          JOIN roles r ON r.id = tra.role_id
          WHERE tra.user_id = u.id AND tra.revoked_at IS NULL AND r.name = 'moderator'
        ) THEN 'moderator'
        ELSE 'community_member'
      END AS role,
      EXISTS (
        SELECT 1 FROM discord_identities di WHERE di.user_id = u.id
      ) AS discord_linked
    FROM public.users u
    LEFT JOIN tracker_user_settings tus ON tus.user_id = u.id
    WHERE EXISTS (
      SELECT 1 FROM tracker_role_assignments tra WHERE tra.user_id = u.id AND tra.revoked_at IS NULL
    ) OR tus.user_id IS NOT NULL
    ORDER BY
      CASE
        WHEN EXISTS (
          SELECT 1 FROM tracker_role_assignments tra
          JOIN roles r ON r.id = tra.role_id
          WHERE tra.user_id = u.id AND tra.revoked_at IS NULL AND r.name = 'committee'
        ) THEN 1
        WHEN EXISTS (
          SELECT 1 FROM tracker_role_assignments tra
          JOIN roles r ON r.id = tra.role_id
          WHERE tra.user_id = u.id AND tra.revoked_at IS NULL AND r.name = 'moderator'
        ) THEN 2
        ELSE 3
      END,
      u.display_name
  `;
}
