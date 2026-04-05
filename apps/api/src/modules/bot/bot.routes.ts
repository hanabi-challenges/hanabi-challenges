// Discord bot webhook routes.
//
// The Discord bot is the authoritative source for community role assignments.
// When a Discord role changes, the bot calls this endpoint to update the site DB
// immediately. The site never polls Discord — only the DB is checked on login.
//
// GET  /api/bot/role-grants — fetch the Discord role ID → site role mapping
// POST /api/bot/roles       — update a user's roles by discord_id
// POST /api/bot/link        — link a Discord account to a site user by h-live username
//
// Authentication: Authorization: Bearer <BOT_SECRET>
// BOT_SECRET is a shared secret configured in the server environment.
// Returns 503 if BOT_SECRET is not configured.
//
// Note: POST /api/bot/roles does NOT enforce the last-SUPERADMIN guard.
// The bot is authoritative; it should be designed to avoid that state.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../../config/env';
import { pool } from '../../config/db';
import { updateUserRolesAndBumpVersion, UserNotFoundError } from '../auth/auth.service';
import { setUserDiscordId } from '../auth/discord.service';
import type { UserRole } from '../../middleware/authMiddleware';

const router = Router();

const VALID_ROLES: readonly UserRole[] = ['USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN'];

function botAuth(req: Request, res: Response, next: NextFunction): void {
  if (!env.BOT_SECRET) {
    res.status(503).json({ error: 'Bot endpoint not configured on this server' });
    return;
  }
  const authHeader = req.headers.authorization ?? '';
  if (!authHeader.startsWith('Bearer ') || authHeader.slice('Bearer '.length) !== env.BOT_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// GET /bot/role-grants
// Returns the full discord_role_grants table so the bot can build its mapping cache.
router.get('/role-grants', botAuth, async (_req: Request, res: Response) => {
  const result = await pool.query<{
    guild_id: string;
    role_id: string;
    app_role: string;
    description: string | null;
  }>(
    `SELECT guild_id, role_id, app_role, description FROM discord_role_grants ORDER BY guild_id, role_id`,
  );
  res.json(result.rows);
});

// POST /bot/roles
// Body: { discord_id: string, roles: string[] }
// Updates the user's roles and increments token_version, invalidating existing sessions.
router.post('/roles', botAuth, async (req: Request, res: Response) => {
  const { discord_id, roles } = req.body as { discord_id?: unknown; roles?: unknown };

  if (typeof discord_id !== 'string' || !discord_id) {
    return res.status(400).json({ error: 'discord_id must be a non-empty string' });
  }
  if (!Array.isArray(roles) || !roles.every((r) => VALID_ROLES.includes(r as UserRole))) {
    return res.status(400).json({ error: `roles must be an array of: ${VALID_ROLES.join(', ')}` });
  }

  // USER must always be present
  let newRoles = roles as UserRole[];
  if (!newRoles.includes('USER')) newRoles = ['USER', ...newRoles];

  const userResult = await pool
    .query<{ id: number }>(`SELECT id FROM users WHERE discord_id = $1 LIMIT 1`, [discord_id])
    .catch((err: unknown) => {
      throw err;
    });

  if (!userResult.rowCount) {
    // No linked account yet — store as pending. Applied when the user links Discord.
    await pool.query(
      `INSERT INTO discord_pending_roles (discord_id, roles, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (discord_id) DO UPDATE SET roles = EXCLUDED.roles, updated_at = NOW()`,
      [discord_id, newRoles],
    );
    return res.status(202).json({ queued: true });
  }

  try {
    const updated = await updateUserRolesAndBumpVersion(userResult.rows[0].id, newRoles);
    res.json({
      id: userResult.rows[0].id,
      roles: updated.roles,
      token_version: updated.token_version,
    });
  } catch (err) {
    if (err instanceof UserNotFoundError) {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('[bot/roles]', err);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

// POST /bot/link
// Body: { discord_id: string, hanabi_username: string }
// Links a Discord account to a site user identified by their h-live username.
// Creates a shadow user if one doesn't exist yet, then applies any pending role grants.
// Idempotent: re-linking the same pair returns { ok: true, already_linked: true }.
router.post('/link', botAuth, async (req: Request, res: Response) => {
  const { discord_id, hanabi_username } = req.body as {
    discord_id?: unknown;
    hanabi_username?: unknown;
  };

  if (typeof discord_id !== 'string' || !discord_id) {
    return res.status(400).json({ error: 'discord_id must be a non-empty string' });
  }
  if (typeof hanabi_username !== 'string' || !hanabi_username.trim()) {
    return res.status(400).json({ error: 'hanabi_username must be a non-empty string' });
  }

  // Check if this Discord ID is already linked to a different account
  const conflictResult = await pool.query<{ id: number; display_name: string }>(
    `SELECT id, display_name FROM users WHERE discord_id = $1 LIMIT 1`,
    [discord_id],
  );
  if ((conflictResult.rowCount ?? 0) > 0) {
    const linked = conflictResult.rows[0];
    if (linked.display_name.toLowerCase() === hanabi_username.trim().toLowerCase()) {
      return res.json({ ok: true, already_linked: true });
    }
    return res.status(409).json({ error: 'Discord account already linked to a different user' });
  }

  // Find or create the site user by h-live username
  const userResult = await pool.query<{ id: number }>(
    `SELECT id FROM users WHERE display_name = $1 LIMIT 1`,
    [hanabi_username.trim()],
  );

  let userId: number;

  if ((userResult.rowCount ?? 0) > 0) {
    userId = userResult.rows[0].id;
    // setUserDiscordId also applies any pending role grants
    await setUserDiscordId(userId, discord_id);
  } else {
    // Create a shadow user — no password, roles set to default USER
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO users (display_name, discord_id) VALUES ($1, $2) RETURNING id`,
      [hanabi_username.trim(), discord_id],
    );
    userId = inserted.rows[0].id;
    // Apply any pending role grants queued before this account was created
    const pending = await pool.query<{ roles: string[] }>(
      `DELETE FROM discord_pending_roles WHERE discord_id = $1 RETURNING roles`,
      [discord_id],
    );
    if ((pending.rowCount ?? 0) > 0) {
      await updateUserRolesAndBumpVersion(userId, pending.rows[0].roles as UserRole[]);
    }
  }

  res.status(201).json({ ok: true, user_id: userId });
});

export default router;
