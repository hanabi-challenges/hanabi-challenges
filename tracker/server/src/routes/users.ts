import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AssignRoleRequest, AssignRoleResponse, RoleSlug } from '@tracker/types';
import { getPool } from '../db/pool.js';
import { assignRole, revokeRole } from '../db/roles.js';
import { listUsersWithRoles, searchUsersForMention } from '../db/users.js';
import {
  requireTrackerAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

const VALID_ROLES: ReadonlySet<string> = new Set(['moderator', 'committee']);

/** GET /tracker/api/users/mentions?q= — search users for @mention autocomplete (auth required) */
router.get(
  '/mentions',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const q = typeof req.query['q'] === 'string' ? req.query['q'] : '';
    try {
      const sql = getPool();
      const users = await searchUsersForMention(sql, q);
      res.json({ users });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/users — list all users with role and Discord link status (committee only) */
router.get(
  '/',
  requireTrackerAuth,
  requirePermission('user.role.assign'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const users = await listUsersWithRoles(sql);
      res.json({ users });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/users/:userId/roles — assign a role to a user */
router.post(
  '/:userId/roles',
  requireTrackerAuth,
  requirePermission('user.role.assign'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userIdRaw = Array.isArray(req.params['userId'])
      ? req.params['userId'][0]
      : req.params['userId'];
    const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
    if (!userIdRaw || isNaN(userId)) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const { role } = req.body as AssignRoleRequest;
    if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `role must be one of: ${[...VALID_ROLES].join(', ')}.`,
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const result = await assignRole(
        sql,
        userId,
        role as RoleSlug,
        (req as AuthenticatedRequest).trackerUser.id,
      );

      if (!result.ok) {
        const code = result.reason === 'already_assigned' ? 'CONFLICT' : 'VALIDATION_ERROR';
        const status = result.reason === 'already_assigned' ? 409 : 422;
        res.status(status).json({
          error: {
            code,
            message: result.reason,
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      const body: AssignRoleResponse = { user_id: userId, role: role as RoleSlug };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /tracker/api/users/:userId/roles/:roleSlug — revoke a role from a user */
router.delete(
  '/:userId/roles/:roleSlug',
  requireTrackerAuth,
  requirePermission('user.role.assign'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userIdRaw = Array.isArray(req.params['userId'])
      ? req.params['userId'][0]
      : req.params['userId'];
    const userId = userIdRaw ? parseInt(userIdRaw, 10) : NaN;
    const roleSlug = req.params['roleSlug'] as string | undefined;

    if (!userIdRaw || isNaN(userId) || !roleSlug || !VALID_ROLES.has(roleSlug)) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid user or role.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const result = await revokeRole(
        sql,
        userId,
        roleSlug as RoleSlug,
        (req as AuthenticatedRequest).trackerUser.id,
      );

      if (!result.ok) {
        const status = result.reason === 'not_assigned' ? 404 : 422;
        res.status(status).json({
          error: {
            code: 'NOT_FOUND',
            message: result.reason,
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

export { router as usersRouter };
