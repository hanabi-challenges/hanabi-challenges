import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { pool } from '../config/db';

export type UserRole = 'USER' | 'HOST' | 'MOD' | 'SITE_ADMIN' | 'SUPERADMIN';

export interface AuthPayload {
  userId: number;
  displayName: string;
  roles: UserRole[];
  color_hex: string;
  text_color: string;
  token_version: number;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

/**
 * Returns true if the user has the given role or is a SUPERADMIN.
 * Safe to call with an undefined user (returns false).
 */
export function hasRole(user: AuthPayload | undefined, role: UserRole): boolean {
  if (!user) return false;
  return user.roles.includes('SUPERADMIN') || user.roles.includes(role);
}

/**
 * Normalises a raw JWT payload from either the new format (roles[]) or the
 * legacy format (role scalar) so that existing sessions survive the migration.
 * Defaults token_version to 1 for tokens issued before versioning was added —
 * they will pass the DB check since the DB default is also 1.
 */
function normalisePayload(raw: Record<string, unknown>): AuthPayload {
  let roles: UserRole[];
  if (Array.isArray(raw.roles)) {
    roles = raw.roles as UserRole[];
  } else if (typeof raw.role === 'string') {
    // Legacy token — convert scalar to array using the same migration mapping.
    const r = raw.role as string;
    if (r === 'SUPERADMIN') roles = ['USER', 'SUPERADMIN'];
    else if (r === 'ADMIN') roles = ['USER', 'HOST', 'SITE_ADMIN'];
    else roles = ['USER'];
  } else {
    roles = ['USER'];
  }
  return {
    userId: raw.userId as number,
    displayName: raw.displayName as string,
    roles,
    color_hex: (raw.color_hex as string) ?? '#777777',
    text_color: (raw.text_color as string) ?? '#ffffff',
    token_version: typeof raw.token_version === 'number' ? raw.token_version : 1,
    iat: raw.iat as number,
    exp: raw.exp as number,
  };
}

/**
 * Verify that the token_version in the JWT matches the DB.
 * Returns false if the user doesn't exist or the version has been bumped
 * (i.e. their roles changed and the session was invalidated).
 */
async function verifyTokenVersion(userId: number, tokenVersion: number): Promise<boolean> {
  const result = await pool.query<{ token_version: number }>(
    `SELECT token_version FROM users WHERE id = $1`,
    [userId],
  );
  if (!result.rowCount) return false;
  return result.rows[0].token_version === tokenVersion;
}

// Attempt to authenticate if Authorization header is present; otherwise continue.
// Uses .then/.catch(next) to handle the async DB check without making the
// Express middleware signature async (Express 4 does not catch async rejections).
export function authOptional(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice('Bearer '.length);

  let payload: AuthPayload;
  try {
    const raw = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    payload = normalisePayload(raw);
  } catch {
    // Invalid token — treat as unauthenticated
    return next();
  }

  verifyTokenVersion(payload.userId, payload.token_version)
    .then((valid) => {
      if (valid) req.user = payload;
      next();
    })
    .catch(next);
}

// Require a valid, non-invalidated JWT.
export function authRequired(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  let payload: AuthPayload;
  try {
    const raw = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    payload = normalisePayload(raw);
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  verifyTokenVersion(payload.userId, payload.token_version)
    .then((valid) => {
      if (!valid) {
        res.status(401).json({ error: 'Session invalidated — please log in again' });
        return;
      }
      req.user = payload;
      next();
    })
    .catch(next);
}

// Require SUPERADMIN role
export function requireSuperadmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!hasRole(user, 'SUPERADMIN')) {
    res.status(403).json({ error: 'SUPERADMIN role required' });
    return;
  }
  next();
}

// Require HOST role (or SUPERADMIN) — event creation and management
export function requireHost(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!hasRole(user, 'HOST')) {
    res.status(403).json({ error: 'HOST role required' });
    return;
  }
  next();
}

// Require SITE_ADMIN role (or SUPERADMIN) — site content, variants, badges
export function requireSiteAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!hasRole(user, 'SITE_ADMIN')) {
    res.status(403).json({ error: 'SITE_ADMIN role required' });
    return;
  }
  next();
}

// Require MOD role (or SUPERADMIN) — tracker ticket moderation
export function requireMod(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  if (!hasRole(user, 'MOD')) {
    res.status(403).json({ error: 'MOD role required' });
    return;
  }
  next();
}
