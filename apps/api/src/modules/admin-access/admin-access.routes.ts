import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { createAdminAccessRequest, getLatestRequestForUser } from './admin-access.service';

const router = Router();

router.get(
  '/admin-access-requests/me',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const request = await getLatestRequestForUser(userId);
      res.json({ request });
    } catch (err) {
      console.error('Error loading own admin access request:', err);
      res.status(500).json({ error: 'Failed to load admin access request status' });
    }
  },
);

router.post(
  '/admin-access-requests',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const reason = reasonRaw.length > 0 ? reasonRaw : null;

    try {
      const request = await createAdminAccessRequest({
        requesterUserId: userId,
        reason,
      });
      res.status(201).json({ request });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'ALREADY_ADMIN') {
        return res.status(409).json({ error: 'You already have admin access' });
      }
      if (code === 'PENDING_EXISTS') {
        return res.status(409).json({ error: 'An admin access request is already pending' });
      }
      if (code === 'USER_NOT_FOUND') {
        return res.status(404).json({ error: 'User not found' });
      }
      console.error('Error creating admin access request:', err);
      res.status(500).json({ error: 'Failed to submit admin access request' });
    }
  },
);

export default router;
