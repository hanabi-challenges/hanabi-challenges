// Discord OAuth2 link/unlink service.
//
// ## Overview
// Users can link their Discord account to their hanabi-challenges account.
// Role assignment is handled by the Discord bot, which calls POST /api/bot/roles
// whenever a user's Discord roles change. The site never polls Discord.
//
// ## Configuration (environment variables)
//   DISCORD_CLIENT_ID      — OAuth2 application client ID
//   DISCORD_CLIENT_SECRET  — OAuth2 application client secret
//   DISCORD_REDIRECT_URI   — Callback URL for the OAuth2 flow
//
// ## Flow
// 1. User clicks "Link Discord" → GET /auth/discord redirects to Discord OAuth
// 2. Discord redirects back → GET /auth/discord/callback saves discord_id on
//    the user row.
// 3. The Discord bot detects the new link and pushes current roles via
//    POST /api/bot/roles.

import { pool } from '../../config/db';
import { updateUserRolesAndBumpVersion } from './auth.service';
import type { UserRole } from '../../middleware/authMiddleware';

const DISCORD_BASE = 'https://discord.com/api/v10';

// ---------------------------------------------------------------------------
// Link / unlink
// ---------------------------------------------------------------------------

/**
 * Store (or clear) a user's Discord ID.
 * When linking (discordId non-null), any pending role grants queued by the
 * Discord bot before the user linked are applied immediately and cleared.
 */
export async function setUserDiscordId(userId: number, discordId: string | null): Promise<void> {
  await pool.query(`UPDATE users SET discord_id = $1 WHERE id = $2`, [discordId, userId]);

  if (discordId) {
    const pending = await pool.query<{ roles: string[] }>(
      `DELETE FROM discord_pending_roles WHERE discord_id = $1 RETURNING roles`,
      [discordId],
    );
    if ((pending.rowCount ?? 0) > 0) {
      await updateUserRolesAndBumpVersion(userId, pending.rows[0].roles as UserRole[]);
    }
  }
}

// ---------------------------------------------------------------------------
// OAuth2 helpers
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
