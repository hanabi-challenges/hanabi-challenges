// src/modules/auth/auth.routes.ts
import { Router, type Request, type Response } from 'express';
import {
  authRequired,
  AuthenticatedRequest,
  requireSuperadmin,
} from '../../middleware/authMiddleware';
import {
  changeUserPassword,
  loginExistingUser,
  pickTextColor,
  randomHexColor,
  recoverPasswordWithIdentityToken,
  registerUserWithIdentityToken,
  resolveHanabIdentityToken,
  updateUserRolesAndBumpVersion,
  userExistsByDisplayName,
} from './auth.service';
import { pool } from '../../config/db';

const router = Router();

// POST /api/login
router.post('/login', async (req: Request, res: Response) => {
  const { display_name, password } = req.body;

  if (!display_name || !password) {
    res.status(400).json({ error: 'display_name and password are required' });
    return;
  }

  try {
    const result = await loginExistingUser(display_name, password);
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'USER_NOT_FOUND') {
      res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      return;
    }
    if (err.code === 'INVALID_CREDENTIALS') {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    console.error('Error during login:', err);
    res.status(500).json({ error: 'Failed to log in' });
  }
});

// GET /api/auth/username-status?display_name=...
router.get('/auth/username-status', async (req: Request, res: Response) => {
  const display_name = String(req.query.display_name ?? '').trim();
  if (!display_name) {
    return res.status(400).json({ error: 'display_name is required' });
  }

  try {
    const exists = await userExistsByDisplayName(display_name);
    res.json({ exists });
  } catch (err) {
    console.error('Error checking username status:', err);
    res.status(500).json({ error: 'Failed to check username status' });
  }
});

// POST /api/auth/identity
router.post('/auth/identity', async (req: Request, res: Response) => {
  const token = String(req.body?.token ?? '').trim();
  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  try {
    const result = await resolveHanabIdentityToken(token);
    res.json(result);
  } catch (err) {
    if (err.code === 'INVALID_TOKEN') {
      return res.status(400).json({ error: 'Invalid token' });
    }

    console.error('Error resolving hanab identity token:', err);
    res.status(502).json({ error: 'Failed to validate token' });
  }
});

// POST /api/register
router.post('/register', async (req: Request, res: Response) => {
  const { password, token } = req.body ?? {};
  if (!password || !token) {
    return res.status(400).json({ error: 'password and token are required' });
  }

  try {
    const result = await registerUserWithIdentityToken({
      password: String(password),
      token: String(token),
    });
    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'INVALID_TOKEN') {
      return res.status(400).json({ error: 'Invalid token' });
    }
    if (err.code === 'INVALID_CREDENTIALS') {
      return res.status(409).json({ error: 'Account already exists for this token identity' });
    }

    console.error('Error during registration:', err);
    res.status(500).json({ error: 'Failed to register' });
  }
});

// POST /api/auth/recover-password
router.post('/auth/recover-password', async (req: Request, res: Response) => {
  const { password, token } = req.body ?? {};
  if (!password || !token) {
    return res.status(400).json({ error: 'password and token are required' });
  }
  if (String(password).length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' });
  }

  try {
    const result = await recoverPasswordWithIdentityToken({
      password: String(password),
      token: String(token),
    });
    res.status(200).json(result);
  } catch (err) {
    if (err.code === 'INVALID_TOKEN') {
      return res.status(400).json({ error: 'Invalid token' });
    }
    if (err.code === 'USER_NOT_FOUND') {
      return res.status(404).json({ error: 'No existing account found for this token identity' });
    }

    console.error('Error recovering password:', err);
    res.status(500).json({ error: 'Failed to recover password' });
  }
});

// GET /api/me
router.get('/me', authRequired, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    message: 'Token is valid',
    user: req.user,
  });
});

// POST /api/auth/change-password
router.post(
  '/auth/change-password',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const currentPassword =
      typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const newPassword = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
    const userId = req.user?.userId ?? null;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'current_password and new_password are required' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'new_password must be at least 4 characters' });
    }
    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ error: 'new_password must be different from current_password' });
    }

    try {
      await changeUserPassword(userId, currentPassword, newPassword);
      res.json({ ok: true });
    } catch (err) {
      if (err.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: 'User not found' });
      }
      if (err.code === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      console.error('Error changing password:', err);
      res.status(500).json({ error: 'Failed to change password' });
    }
  },
);

// GET /api/users/:display_name
router.get('/users/:display_name', async (req: Request, res: Response) => {
  const { display_name } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT id, display_name, roles, color_hex, text_color, created_at
      FROM users
      WHERE display_name = $1;
      `,
      [display_name],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const row = result.rows[0];
    const color = row.color_hex ?? randomHexColor();
    const textColor = row.text_color ?? pickTextColor(color);

    // Backfill if missing
    if (!row.color_hex || !row.text_color) {
      await pool.query(
        `
        UPDATE users
        SET color_hex = $1, text_color = $2
        WHERE id = $3;
        `,
        [color, textColor, row.id],
      );
    }

    res.json({
      ...row,
      color_hex: color,
      text_color: textColor,
    });
  } catch (err) {
    console.error('Error fetching user by display_name:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// GET /api/users/:display_name/events
router.get('/users/:display_name/events', async (req: Request, res: Response) => {
  const { display_name } = req.params;

  try {
    const result = await pool.query(
      `
      SELECT
        et.id AS event_team_id,
        'Team ' || (
          SELECT u2.display_name
          FROM event_team_members etm2
          JOIN users u2 ON u2.id = etm2.user_id
          WHERE etm2.event_team_id = et.id
          ORDER BY LOWER(u2.display_name) ASC
          LIMIT 1
        ) AS team_name,
        et.team_size,
        et.event_id,
        e.name AS event_name,
        e.slug AS event_slug,
        e.short_description,
        e.long_description,
        (SELECT MIN(es.starts_at) FROM event_stages es WHERE es.event_id = e.id) AS starts_at,
        (SELECT MAX(es.ends_at) FROM event_stages es WHERE es.event_id = e.id) AS ends_at,
        e.registration_opens_at,
        e.registration_cutoff,
        e.allow_late_registration
      FROM event_teams et
      JOIN event_team_members etm ON etm.event_team_id = et.id
      JOIN users u ON u.id = etm.user_id
      JOIN events e ON e.id = et.event_id
      WHERE u.display_name = $1
        AND et.stage_id IS NULL
      ORDER BY (SELECT MIN(es.starts_at) FROM event_stages es WHERE es.event_id = e.id) NULLS LAST, et.id;
      `,
      [display_name],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user events:', err);
    res.status(500).json({ error: 'Failed to fetch user events' });
  }
});

// GET /api/users (for autocomplete / admin)
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `
      SELECT id, display_name, color_hex, text_color, roles
      FROM users
      ORDER BY display_name;
      `,
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const VALID_ROLES = ['USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN'] as const;
type GrantableRole = (typeof VALID_ROLES)[number];

async function updateUserRoles(req: AuthenticatedRequest, res: Response) {
  const userId = Number(req.params.id);
  // Accept either { roles: string[] } (grant full set) or { role: string, action: 'add'|'remove' }
  const body = req.body as { roles?: string[]; role?: string; action?: string };
  const actor = req.user;

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (actor && actor.userId === userId) {
    return res.status(400).json({ error: 'You cannot change your own roles' });
  }

  // Determine the new roles array
  let newRoles: GrantableRole[];
  if (Array.isArray(body.roles)) {
    if (!body.roles.every((r) => VALID_ROLES.includes(r as GrantableRole))) {
      return res
        .status(400)
        .json({ error: `roles must be a subset of: ${VALID_ROLES.join(', ')}` });
    }
    newRoles = body.roles as GrantableRole[];
  } else if (typeof body.role === 'string' && (body.action === 'add' || body.action === 'remove')) {
    if (!VALID_ROLES.includes(body.role as GrantableRole)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    const current = await pool.query<{ roles: string[] }>(`SELECT roles FROM users WHERE id = $1`, [
      userId,
    ]);
    if (!current.rowCount) return res.status(404).json({ error: 'User not found' });
    const existing = current.rows[0].roles as GrantableRole[];
    if (body.action === 'add') {
      newRoles = [...new Set([...existing, body.role as GrantableRole])];
    } else {
      newRoles = existing.filter((r) => r !== body.role);
    }
  } else {
    return res.status(400).json({
      error: 'Provide either { roles: string[] } or { role: string, action: "add"|"remove" }',
    });
  }

  // USER must always be present
  if (!newRoles.includes('USER')) newRoles = ['USER', ...newRoles];

  try {
    const targetResult = await pool.query<{ roles: string[] }>(
      `SELECT roles FROM users WHERE id = $1`,
      [userId],
    );
    if (!targetResult.rowCount) return res.status(404).json({ error: 'User not found' });

    const currentRoles = targetResult.rows[0].roles;
    const removingSuperadmin =
      currentRoles.includes('SUPERADMIN') && !newRoles.includes('SUPERADMIN');

    if (removingSuperadmin) {
      const superadminCountResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM users WHERE 'SUPERADMIN' = ANY(roles)`,
      );
      const superadminCount = Number(superadminCountResult.rows[0]?.count ?? '0');
      if (superadminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove SUPERADMIN from the last superadmin' });
      }
    }

    const updated = await updateUserRolesAndBumpVersion(userId, newRoles);
    res.json({ id: userId, roles: updated.roles });
  } catch (err) {
    console.error('Error updating roles:', err);
    res.status(500).json({ error: 'Failed to update roles' });
  }
}

// PATCH /api/users/:id/roles (SUPERADMIN only)
router.patch('/users/:id/roles', authRequired, requireSuperadmin, updateUserRoles);
// Legacy path kept for compatibility
router.patch('/users/:id/role', authRequired, requireSuperadmin, updateUserRoles);

export default router;
