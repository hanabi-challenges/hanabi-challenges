/**
 * Test-only routes — mounted only when NODE_ENV !== 'production'.
 *
 * These endpoints exist solely to support E2E test setup. They are never
 * present in production builds; the NODE_ENV guard in app.ts is the gate.
 */
import { Router, type Request, type Response } from 'express';
import { getPool } from '../db/pool.js';
import { linkDiscordIdentity } from '../db/discord-bot.js';
import { requireTrackerAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

interface SeedUser {
  username: string;
  display_name?: string;
  role?: 'community_member' | 'moderator' | 'committee';
}

/**
 * POST /tracker/api/test/seed
 *
 * Wipes all tracker ticket data (tickets, comments, votes, history,
 * notifications) and seeds a set of users with their roles.
 * Users already present are upserted; roles are replaced.
 *
 * Returns the seeded users with their UUIDs so tests can reference them
 * by ID in subsequent calls.
 */
router.post('/seed', async (req: Request, res: Response): Promise<void> => {
  const users: SeedUser[] = Array.isArray(req.body?.users) ? (req.body.users as SeedUser[]) : [];

  try {
    const sql = getPool();

    // Wipe ticket-related and discord-related data; preserve users / roles so
    // callers can call /test/seed multiple times with the same users across test files.
    await sql`DELETE FROM inbound_webhook_log`;
    await sql`DELETE FROM discord_role_sync_log`;
    await sql`DELETE FROM discord_delivery_log`;
    await sql`DELETE FROM discord_identities`;
    await sql`DELETE FROM github_links`;
    await sql`DELETE FROM user_notifications`;
    await sql`DELETE FROM notification_events`;
    await sql`DELETE FROM ticket_subscriptions`;
    await sql`DELETE FROM ticket_votes`;
    await sql`DELETE FROM ticket_comments`;
    await sql`DELETE FROM ticket_status_history`;
    await sql`DELETE FROM tickets`;
    // Wipe role assignments so each seed call starts with a clean role state.
    // Roles are re-assigned below for each seeded user.
    await sql`DELETE FROM user_role_assignments`;

    // Upsert each requested user and assign their role.
    const seeded: { username: string; id: string; role: string }[] = [];

    for (const u of users) {
      const username = u.username;
      const displayName = u.display_name ?? username;

      const [row] = await sql<{ id: string }[]>`
        INSERT INTO users (hanablive_username, display_name)
        VALUES (${username}, ${displayName})
        ON CONFLICT (hanablive_username) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id
      `;
      if (!row) throw new Error(`seed: failed to upsert user ${username}`);

      const userId = row.id;

      if (u.role && u.role !== 'community_member') {
        // Resolve role id
        const [roleRow] = await sql<{ id: number }[]>`
          SELECT id FROM roles WHERE name = ${u.role}
        `;
        if (!roleRow) throw new Error(`seed: unknown role ${u.role}`);

        await sql`
          INSERT INTO user_role_assignments (user_id, role_id, granted_by)
          VALUES (${userId}, ${roleRow.id}, ${userId})
          ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING
        `;
      }

      const resolvedRole = u.role ?? 'community_member';
      seeded.push({ username, id: userId, role: resolvedRole });
    }

    res.json({ seeded });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /tracker/api/test/user/:username
 *
 * Returns the tracker user record for a given hanabLiveUsername.
 * Used by tests to look up user IDs without going through the main auth flow.
 */
router.get('/user/:username', async (req: Request, res: Response): Promise<void> => {
  const username = req.params['username'];
  if (!username) {
    res.status(400).json({ error: 'username required' });
    return;
  }

  try {
    const sql = getPool();
    const [row] = await sql<{ id: string; hanablive_username: string; display_name: string }[]>`
      SELECT id, hanablive_username, display_name FROM users WHERE hanablive_username = ${username}
    `;
    if (!row) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /tracker/api/test/discord-link
 *
 * Simulates the Discord bot linking a user's Discord identity.
 * In production this happens via the Discord /token slash command;
 * this endpoint is the CI stand-in that skips the real Discord API.
 *
 * Requires test auth (X-Tracker-Test-Username header).
 * Body: { discord_user_id: string, discord_username: string }
 */
router.post(
  '/discord-link',
  requireTrackerAuth,
  async (req: Request, res: Response): Promise<void> => {
    const { discord_user_id, discord_username } = req.body as {
      discord_user_id?: string;
      discord_username?: string;
    };

    if (!discord_user_id || !discord_username) {
      res.status(422).json({ error: 'discord_user_id and discord_username are required' });
      return;
    }

    try {
      const sql = getPool();
      const userId = (req as AuthenticatedRequest).trackerUser.id;
      const result = await linkDiscordIdentity(sql, userId, discord_user_id, discord_username);
      if (!result.ok) {
        res.status(409).json({ error: result.reason });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      res.status(500).json({ error: message });
    }
  },
);

export { router as testRouter };
