import type { Sql } from 'postgres';

/**
 * Records a Discord role grant or revocation event from the guild.
 * Written by the bot when it detects a role change; read by the /token handler.
 */
export async function recordRoleSyncEvent(
  sql: Sql,
  discordUserId: string,
  discordRoleName: string,
  eventType: 'granted' | 'revoked',
): Promise<void> {
  await sql`
    INSERT INTO discord_role_sync_log (discord_user_id, discord_role_name, event_type)
    VALUES (${discordUserId}, ${discordRoleName}, ${eventType})
  `;
}

/**
 * Links a Discord user to a tracker user.
 * Called by the /token slash command after the user authenticates.
 * Returns false if the Discord user is already linked to a different tracker user.
 */
export async function linkDiscordIdentity(
  sql: Sql,
  userId: string,
  discordUserId: string,
  discordUsername: string,
): Promise<{ ok: true } | { ok: false; reason: 'already_linked' }> {
  const rows = await sql<{ user_id: string }[]>`
    INSERT INTO discord_identities (user_id, discord_user_id, discord_username)
    VALUES (${userId}, ${discordUserId}, ${discordUsername})
    ON CONFLICT (discord_user_id) DO NOTHING
    RETURNING user_id
  `;
  if (rows.length === 0) return { ok: false, reason: 'already_linked' };
  return { ok: true };
}

interface PendingGrant {
  id: string;
  discord_role_name: string;
}

/** Fetches unprocessed role sync events for a Discord user. */
export async function getPendingRoleGrants(
  sql: Sql,
  discordUserId: string,
): Promise<PendingGrant[]> {
  return sql<PendingGrant[]>`
    SELECT id, discord_role_name
    FROM discord_role_sync_log
    WHERE discord_user_id = ${discordUserId}
      AND event_type = 'granted'
      AND applied = FALSE
    ORDER BY created_at ASC
  `;
}

/** Marks role sync log entries as applied. */
export async function markRoleGrantsApplied(sql: Sql, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await sql`
    UPDATE discord_role_sync_log SET applied = TRUE
    WHERE id = ANY(${ids}::uuid[])
  `;
}

/**
 * Looks up a tracker user ID by Discord user ID.
 * Returns null if the Discord user is not linked.
 */
export async function getUserByDiscordId(
  sql: Sql,
  discordUserId: string,
): Promise<{ user_id: string } | null> {
  const [row] = await sql<{ user_id: string }[]>`
    SELECT user_id FROM discord_identities WHERE discord_user_id = ${discordUserId}
  `;
  return row ?? null;
}
