import { Router, type Response } from 'express';
import { authOptional, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAggregate } from './leaderboards.service';

// Mounted at /api/events/:slug via events.routes.ts (mergeParams: true)
// Routes:
//   GET /leaderboard — event aggregate leaderboard
const router = Router({ mergeParams: true });

// GET /api/events/:slug/leaderboard
router.get('/leaderboard', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const tracks = await getEventAggregate(event.id);
  if (tracks === null) return res.status(404).json({ error: 'Event not found' });

  res.json({ tracks });
});

export default router;
