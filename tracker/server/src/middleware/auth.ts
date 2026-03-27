import { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import type { TrackerUser, TrackerErrorResponse } from '@tracker/types';
import { getPool } from '../db/pool.js';
import { upsertTrackerUser, resolveUserRole } from '../db/users.js';

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
  ]),
  committee: new Set([
    'ticket.create',
    'ticket.comment',
    'ticket.vote',
    'ticket.triage',
    'ticket.transition',
    'ticket.view_internal',
    'ticket.decide',
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
 */
export async function requireTrackerAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const siteUser = (req as Request & { user?: SiteUser }).user;
  const hanabLiveUsername = siteUser?.hanabLiveUsername;

  if (!hanabLiveUsername) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required.', req));
    return;
  }

  const displayName = siteUser.displayName ?? hanabLiveUsername;

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
