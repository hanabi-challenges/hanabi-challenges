import { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import type { TrackerUser, TrackerErrorResponse } from '@tracker/types';
import { getPool } from '../db/pool.js';
import { upsertTrackerUser, resolveUserRole } from '../db/users.js';
import { env } from '../env.js';

/**
 * Shape of req.user as attached by the main site's auth middleware.
 * The tracker only reads hanabLiveUsername and, optionally, displayName.
 */
interface SiteUser {
  hanabLiveUsername?: string;
  displayName?: string;
}

/**
 * Extended request type after requireTrackerAuth has run.
 * Use this type in route handlers that sit behind requireTrackerAuth.
 */
export interface AuthenticatedRequest extends Request {
  trackerUser: TrackerUser;
  correlationId: string;
}

/**
 * Per-role permission sets. Must stay in sync with the seed data in
 * migration 20260327000000_core_lookup_tables.sql.
 */
const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = {
  community_member: new Set(['ticket.create', 'ticket.comment', 'ticket.vote']),
  moderator: new Set([
    'ticket.create',
    'ticket.comment',
    'ticket.vote',
    'ticket.triage',
    'ticket.transition',
    'ticket.view_internal',
    'ticket.flag_for_review',
  ]),
  committee: new Set([
    'ticket.create',
    'ticket.comment',
    'ticket.vote',
    'ticket.triage',
    'ticket.transition',
    'ticket.view_internal',
    'ticket.decide',
    'ticket.flag_for_review',
    'user.role.assign',
  ]),
};

function correlationId(req: Request): string {
  return (req as Partial<AuthenticatedRequest>).correlationId ?? randomUUID();
}

function errorResponse(code: string, message: string, req: Request): TrackerErrorResponse {
  return { error: { code, message, correlationId: correlationId(req) } };
}

/**
 * Reads the hanab.live username from the existing site session, upserts
 * the tracker user record, resolves the role, and attaches req.trackerUser.
 *
 * Returns 401 if no authenticated session is present.
 * Returns 403 if the account_status is 'banned' or 'restricted'.
 *
 * In non-production environments, the X-Tracker-Test-Username header may be
 * used to supply a username directly (bypassing the main site's JWT). This
 * header is never honoured in production.
 */
export async function requireTrackerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const siteUser = (req as Request & { user?: SiteUser }).user;

  // Test-mode auth: accept a plain username header in non-production only.
  // Never enabled in production — NODE_ENV check is the gate.
  const testUsername =
    process.env['NODE_ENV'] !== 'production' && req.headers
      ? (req.headers['x-tracker-test-username'] as string | undefined)
      : undefined;

  // Cookie-based auth: decode the main site's hanabi_token JWT.
  let cookieUsername: string | undefined;
  if (!testUsername && !siteUser?.hanabLiveUsername && env.JWT_SECRET) {
    const cookieHeader = req.headers?.cookie ?? '';
    const token = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('hanabi_token='))
      ?.slice('hanabi_token='.length);
    if (token) {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET) as { displayName?: string };
        cookieUsername = payload.displayName;
      } catch {
        // Invalid or expired token — fall through to 401
      }
    }
  }

  const hanabLiveUsername = testUsername ?? siteUser?.hanabLiveUsername ?? cookieUsername;

  if (!hanabLiveUsername) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required.', req));
    return;
  }

  const displayName = testUsername ?? siteUser?.displayName ?? cookieUsername ?? hanabLiveUsername;

  try {
    const sql = getPool();
    const user = await upsertTrackerUser(sql, hanabLiveUsername, displayName);

    if (user.account_status === 'banned' || user.account_status === 'restricted') {
      res
        .status(403)
        .json(errorResponse('FORBIDDEN', 'Your account does not have access to the tracker.', req));
      return;
    }

    const role = await resolveUserRole(sql, user.id);

    (req as AuthenticatedRequest).trackerUser = {
      id: user.id,
      hanablive_username: user.hanablive_username,
      display_name: user.display_name,
      account_status: user.account_status,
      role,
    };

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware factory. Returns a middleware that checks whether
 * req.trackerUser has the given permission.
 *
 * Must be used after requireTrackerAuth in the middleware chain.
 */
export function requirePermission(
  action: string,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    const trackerUser = (req as Partial<AuthenticatedRequest>).trackerUser;

    if (!trackerUser) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required.', req));
      return;
    }

    const allowed = ROLE_PERMISSIONS[trackerUser.role];
    if (!allowed?.has(action)) {
      res.status(403).json(errorResponse('FORBIDDEN', `Permission denied: ${action}.`, req));
      return;
    }

    next();
  };
}
