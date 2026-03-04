import { Router, Response } from 'express';
import {
  authOptional,
  authRequired,
  AuthenticatedRequest,
  requireAdmin,
} from '../../middleware/authMiddleware';
import { getVariantSyncState, listHanabiVariants, syncHanabiVariants } from './variants.service';

const router = Router();

router.get('/variants', authOptional, async (_req, res: Response) => {
  try {
    const [variants, sync] = await Promise.all([listHanabiVariants(), getVariantSyncState()]);
    res.json({
      variants,
      last_synced_at: sync.last_synced_at,
    });
  } catch (err) {
    console.error('Error listing Hanabi variants', err);
    res.status(500).json({ error: 'Failed to load variants' });
  }
});

router.post(
  '/variants/sync',
  authRequired,
  requireAdmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await syncHanabiVariants();
      res.json(result);
    } catch (err) {
      console.error('Error syncing Hanabi variants', err);
      res.status(500).json({ error: 'Failed to sync variants' });
    }
  },
);

export default router;
