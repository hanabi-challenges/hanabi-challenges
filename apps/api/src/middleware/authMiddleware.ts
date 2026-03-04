import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'SUPERADMIN' | 'ADMIN' | 'USER';

export interface AuthPayload {
  userId: number;
  displayName: string;
  role: UserRole;
  color_hex: string;
  text_color: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

// Attempt to authenticate if Authorization header is present; otherwise continue
export function authOptional(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
  } catch {
    // Ignore invalid tokens for optional auth; treat as unauthenticated
  }

  next();
}

// Require a valid JWT
export function authRequired(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require role SUPERADMIN
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

  if (user.role !== 'SUPERADMIN') {
    res.status(403).json({ error: 'SUPERADMIN role required' });
    return;
  }

  next();
}

// Require role ADMIN or SUPERADMIN
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    res.status(403).json({ error: 'ADMIN role required' });
    return;
  }

  next();
}
