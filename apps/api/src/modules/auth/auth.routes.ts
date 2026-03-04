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

// GET /api/auth/identity/:token
router.get('/auth/identity/:token', async (req: Request, res: Response) => {
  const token = String(req.params.token ?? '').trim();
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
      SELECT id, display_name, role, color_hex, text_color, created_at
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
        et.name AS team_name,
        et.team_size,
        et.event_id,
        e.name AS event_name,
        e.slug AS event_slug,
        e.short_description,
        e.long_description,
        e.starts_at,
        e.ends_at,
        e.event_format,
        e.event_status
      FROM event_teams et
      JOIN team_memberships tm ON tm.event_team_id = et.id
      JOIN users u ON u.id = tm.user_id
      JOIN events e ON e.id = et.event_id
      WHERE u.display_name = $1
      ORDER BY e.starts_at NULLS LAST, et.id;
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
      SELECT id, display_name, color_hex, text_color, role
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

async function updateUserRole(req: AuthenticatedRequest, res: Response) {
  const userId = Number(req.params.id);
  const { role } = req.body as { role?: string };
  const actor = req.user;

  if (Number.isNaN(userId)) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (role !== 'SUPERADMIN' && role !== 'ADMIN' && role !== 'USER') {
    return res.status(400).json({ error: 'role must be SUPERADMIN, ADMIN, or USER' });
  }
  if (actor && actor.userId === userId) {
    return res.status(400).json({ error: 'You cannot change your own role' });
  }

  try {
    const targetResult = await pool.query(
      `
      SELECT id, role
      FROM users
      WHERE id = $1;
      `,
      [userId],
    );

    if (targetResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const target = targetResult.rows[0] as { id: number; role: string };

    if (target.role === 'SUPERADMIN' && role !== 'SUPERADMIN') {
      const superadminCountResult = await pool.query<{ count: string }>(
        `
        SELECT COUNT(*)::text AS count
        FROM users
        WHERE role = 'SUPERADMIN';
        `,
      );

      const superadminCount = Number(superadminCountResult.rows[0]?.count ?? '0');
      if (superadminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last SUPERADMIN' });
      }
    }

    await pool.query(
      `
      UPDATE users
      SET role = $1
      WHERE id = $2;
      `,
      [role, userId],
    );

    res.json({ id: userId, role });
  } catch (err) {
    console.error('Error updating role:', err);
    res.status(500).json({ error: 'Failed to update role' });
  }
}

// PATCH /api/users/:id/role (SUPERADMIN only)
router.patch('/users/:id/role', authRequired, requireSuperadmin, updateUserRole);
// POST alias for convenience
router.post('/users/:id/role', authRequired, requireSuperadmin, updateUserRole);

export default router;
