import { Router, type Response } from 'express';
import { authRequired, hasRole, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { listResultsForStage } from '../results/results.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   GET /results  — list all results for this stage (admin) or own results
const router = Router({ mergeParams: true });

router.get('/results', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);

  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const isGlobalAdmin = hasRole(req.user, 'HOST');
  const event = await getEventBySlug(slug, isGlobalAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const stage = await getStage(event.id, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const isSuperadmin = req.user?.roles?.includes('SUPERADMIN') ?? false;
  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  const isAdmin = role !== null;

  const results = await listResultsForStage(stageId, isAdmin ? undefined : userId);
  res.json(results);
});

export default router;
