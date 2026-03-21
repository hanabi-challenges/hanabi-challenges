// Discord role → admin sync service.
//
// ## Overview
// Users can link their Discord account to their hanabi-challenges account.
// This service periodically checks which Discord guild roles a linked user
// holds and promotes them to ADMIN if any of those roles appear in the
// discord_role_grants table.
//
// ## Configuration (environment variables)
//   DISCORD_CLIENT_ID      — OAuth2 application client ID
//   DISCORD_CLIENT_SECRET  — OAuth2 application client secret
//   DISCORD_BOT_TOKEN      — Bot token used to look up guild members
//   DISCORD_GUILD_ID       — The guild (server) whose roles are authoritative
//   DISCORD_REDIRECT_URI   — Callback URL for the OAuth2 flow
//
// All variables are optional at startup; sync is a no-op if BOT_TOKEN or
// GUILD_ID are unset, so the app runs normally before Discord is configured.
//
// ## Flow
// 1. User clicks "Link Discord" → GET /auth/discord redirects to Discord OAuth
// 2. Discord redirects back → POST /auth/discord/callback saves discord_id on
//    the user row.
// 3. A periodic worker (or on-demand endpoint) calls syncDiscordRoles() which:
//    a. Fetches all users with a non-null discord_id
//    b. For each user, fetches their guild member roles from Discord
//    c. Promotes to ADMIN if any role is in discord_role_grants
//    d. Reverts to USER if no role matches AND their current role was discord-granted
//       (never demotes manually-assigned ADMIN or SUPERADMIN)

import { pool } from '../../config/db';

const DISCORD_BASE = 'https://discord.com/api/v10';

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN ?? null;
}

function guildId(): string | null {
  return process.env.DISCORD_GUILD_ID ?? null;
}

// ---------------------------------------------------------------------------
// Discord REST helpers
// ---------------------------------------------------------------------------

async function discordFetch(path: string): Promise<unknown> {
  const token = botToken();
  if (!token) throw new Error('DISCORD_BOT_TOKEN not configured');

  const res = await fetch(`${DISCORD_BASE}${path}`, {
    headers: { Authorization: `Bot ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord API error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Return the Discord role IDs held by a user in the configured guild.
 * Returns an empty array if the user is not a member of the guild.
 */
async function fetchMemberRoleIds(discordUserId: string): Promise<string[]> {
  const guild = guildId();
  if (!guild) throw new Error('DISCORD_GUILD_ID not configured');

  try {
    const member = (await discordFetch(`/guilds/${guild}/members/${discordUserId}`)) as {
      roles?: string[];
    };
    return member.roles ?? [];
  } catch (err) {
    // 404 = not a member of the guild
    if (err instanceof Error && err.message.includes('404')) return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Link / unlink
// ---------------------------------------------------------------------------

/** Store (or clear) a user's Discord ID. */
export async function setUserDiscordId(userId: number, discordId: string | null): Promise<void> {
  await pool.query(`UPDATE users SET discord_id = $1 WHERE id = $2`, [discordId, userId]);
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export type SyncResult = {
  checked: number;
  promoted: number;
  reverted: number;
  errors: string[];
};

/**
 * Synchronise Discord guild roles → app roles for all linked users.
 *
 * - Promotes a USER to ADMIN if they hold a role in discord_role_grants.
 * - Reverts an ADMIN to USER if they no longer hold any granted role,
 *   BUT only if the record has discord_role_managed = true (future column).
 *   For now, we only promote; we never automatically demote, to be safe.
 *
 * Returns a summary of changes made.
 */
export async function syncDiscordRoles(): Promise<SyncResult> {
  const result: SyncResult = { checked: 0, promoted: 0, reverted: 0, errors: [] };

  if (!botToken() || !guildId()) {
    result.errors.push('DISCORD_BOT_TOKEN or DISCORD_GUILD_ID not configured; skipping sync');
    return result;
  }

  // Load all grant rules
  const grantsRes = await pool.query<{ guild_id: string; role_id: string; app_role: string }>(
    `SELECT guild_id, role_id, app_role FROM discord_role_grants`,
  );
  if (grantsRes.rowCount === 0) return result; // no rules configured

  const grantedRoleIds = new Set(grantsRes.rows.map((r) => r.role_id));

  // Load all users with a linked Discord account
  const usersRes = await pool.query<{ id: number; discord_id: string; role: string }>(
    `SELECT id, discord_id, role FROM users WHERE discord_id IS NOT NULL`,
  );

  for (const user of usersRes.rows) {
    result.checked++;

    try {
      const memberRoles = await fetchMemberRoleIds(user.discord_id);
      const hasGrantedRole = memberRoles.some((r) => grantedRoleIds.has(r));

      if (hasGrantedRole && user.role === 'USER') {
        await pool.query(`UPDATE users SET role = 'ADMIN' WHERE id = $1`, [user.id]);
        result.promoted++;
      }
      // Note: we intentionally do not demote — that must be done manually.
    } catch (err) {
      result.errors.push(`User ${user.id}: ${String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// OAuth2 helpers (stubs — fill in when credentials are available)
// ---------------------------------------------------------------------------

/**
 * Build the Discord OAuth2 authorization URL.
 * Scope: identify (to read the user's Discord ID)
 */
export function buildDiscordAuthUrl(state: string): string {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error('Discord OAuth2 not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
};

/**
 * Exchange an OAuth2 code for an access token.
 */
export async function exchangeDiscordCode(code: string): Promise<DiscordTokenResponse> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Discord OAuth2 not configured');
  }

  const res = await fetch(`${DISCORD_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord token exchange error ${res.status}: ${body}`);
  }

  return res.json() as Promise<DiscordTokenResponse>;
}

/**
 * Fetch the Discord user's ID and username using their access token.
 */
export async function fetchDiscordUser(
  accessToken: string,
): Promise<{ id: string; username: string }> {
  const res = await fetch(`${DISCORD_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Discord user fetch error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { id: string; username: string };
  return { id: data.id, username: data.username };
}
