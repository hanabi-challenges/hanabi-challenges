// Discord OAuth2 link/unlink + role-sync routes.
//
// GET  /auth/discord                → redirect to Discord OAuth2
// GET  /auth/discord/callback       → handle OAuth2 callback, link discord_id
// DELETE /auth/discord              → unlink Discord account (authenticated)
// POST /auth/discord/sync           → manually trigger role sync (SUPERADMIN only)
//
// Admin UI for managing discord_role_grants is via the system admin page.

import crypto from 'crypto';
import { Router, type Response } from 'express';
import { authRequired, requireSuperadmin } from '../../middleware/authMiddleware';
import type { AuthenticatedRequest } from '../../middleware/authMiddleware';
import { pool } from '../../config/db';
import {
  buildDiscordAuthUrl,
  exchangeDiscordCode,
  fetchDiscordUser,
  setUserDiscordId,
  syncDiscordRoles,
} from './discord.service';

const router = Router();

// Simple in-memory state store (good enough for short-lived OAuth flows).
// In a multi-instance deployment, replace with Redis or a DB-backed state table.
const pendingStates = new Map<string, { userId: number; expiresAt: number }>();

// GET /auth/discord — redirect to Discord OAuth2 (must be logged in)
router.get('/discord', authRequired, (req: AuthenticatedRequest, res: Response) => {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user!.userId,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });
    // Clean up expired states opportunistically
    for (const [k, v] of pendingStates) {
      if (v.expiresAt < Date.now()) pendingStates.delete(k);
    }
    const url = buildDiscordAuthUrl(state);
    res.redirect(url);
  } catch {
    res.status(503).json({ error: 'Discord OAuth2 is not configured on this server.' });
  }
});

// GET /auth/discord/callback — handle OAuth2 callback
router.get('/discord/callback', async (req: AuthenticatedRequest, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }

  const pending = pendingStates.get(state);
  pendingStates.delete(state);

  if (!pending || pending.expiresAt < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired state' });
  }

  try {
    const tokenRes = await exchangeDiscordCode(code);
    const discordUser = await fetchDiscordUser(tokenRes.access_token);

    // Check if this Discord ID is already linked to a different account
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE discord_id = $1 AND id != $2`,
      [discordUser.id, pending.userId],
    );
    if ((existing.rowCount ?? 0) > 0) {
      return res
        .status(409)
        .json({ error: 'This Discord account is already linked to another user.' });
    }

    await setUserDiscordId(pending.userId, discordUser.id);

    // Redirect back to the profile/settings page on the frontend
    const frontendBase = process.env.FRONTEND_URL ?? '';
    res.redirect(`${frontendBase}/me?discord=linked`);
  } catch (err) {
    console.error('[discord/callback]', err);
    const frontendBase = process.env.FRONTEND_URL ?? '';
    res.redirect(`${frontendBase}/me?discord=error`);
  }
});

// DELETE /auth/discord — unlink Discord account
router.delete('/discord', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  await setUserDiscordId(req.user!.userId, null);
  res.json({ ok: true });
});

// POST /auth/discord/sync — trigger sync for all linked users (SUPERADMIN only)
router.post(
  '/discord/sync',
  authRequired,
  requireSuperadmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await syncDiscordRoles();
      res.json(result);
    } catch (err) {
      console.error('[discord/sync]', err);
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
