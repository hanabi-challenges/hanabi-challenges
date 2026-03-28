import { Router, type Request, type Response, type NextFunction } from 'express';
import type { ListNotificationsResponse } from '@tracker/types';
import { getPool } from '../db/pool.js';
import { listUserNotifications, markNotificationRead } from '../db/notifications.js';
import { requireTrackerAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/** GET /tracker/api/me/notifications */
router.get(
  '/notifications',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const userId = (req as AuthenticatedRequest).trackerUser.id;
      const { notifications, unread_count } = await listUserNotifications(sql, userId);
      const body: ListNotificationsResponse = { notifications, unread_count };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /tracker/api/me/notifications/:id/read */
router.patch(
  '/notifications/:id/read',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Notification not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const userId = (req as AuthenticatedRequest).trackerUser.id;
      const found = await markNotificationRead(sql, id, userId);
      if (!found) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Notification not found.',
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

export { router as meRouter };
