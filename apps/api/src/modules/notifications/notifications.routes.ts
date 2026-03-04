import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import {
  getUnreadNotificationCount,
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from './notifications.service';

const router = Router();

router.get('/notifications', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const limit = Number(req.query.limit ?? '25');

  try {
    const [notifications, unreadCount] = await Promise.all([
      listUserNotifications(userId, limit),
      getUnreadNotificationCount(userId),
    ]);
    res.json({ notifications, unread_count: unreadCount });
  } catch (err) {
    console.error('Error listing notifications:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

router.get(
  '/notifications/unread-count',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const count = await getUnreadNotificationCount(userId);
      res.json({ unread_count: count });
    } catch (err) {
      console.error('Error loading unread notification count:', err);
      res.status(500).json({ error: 'Failed to load unread notification count' });
    }
  },
);

router.post(
  '/notifications/:id/read',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid notification id' });
    }

    try {
      const ok = await markNotificationRead(userId, id);
      if (!ok) return res.status(404).json({ error: 'Notification not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error('Error marking notification read:', err);
      res.status(500).json({ error: 'Failed to mark notification read' });
    }
  },
);

router.post(
  '/notifications/read-all',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const count = await markAllNotificationsRead(userId);
      res.json({ ok: true, marked: count });
    } catch (err) {
      console.error('Error marking all notifications read:', err);
      res.status(500).json({ error: 'Failed to mark all notifications read' });
    }
  },
);

export default router;
