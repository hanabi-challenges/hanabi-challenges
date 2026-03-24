import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { generateBracket, advanceBracket } from './bracket.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   POST /bracket/draw     — admin: generate round-1 bracket from entries
//   POST /bracket/advance  — admin: advance bracket to next round
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ stageId: number; isAdmin: boolean } | null> {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);

  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
    return null;
  }

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isGlobalAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isGlobalAdmin);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  const isAdmin = role !== null;

  return { stageId, isAdmin };
}

// POST /api/events/:slug/stages/:stageId/bracket/draw — generate round-1 bracket (admin)
router.post('/bracket/draw', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;
  if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const result = await generateBracket(ctx.stageId);
  if (result.ok) return res.status(201).json(result);
  const reason = (result as { ok: false; reason: string }).reason;
  if (reason === 'no_entries') return res.status(400).json({ error: 'No bracket entries found' });
  if (reason === 'already_drawn')
    return res.status(409).json({ error: 'Bracket has already been drawn' });
  return res.status(400).json({ error: reason });
});

// POST /api/events/:slug/stages/:stageId/bracket/advance — advance bracket to next round (admin)
router.post('/bracket/advance', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;
  if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' });

  const result = await advanceBracket(ctx.stageId);
  if (result.ok) return res.json(result);
  const reason = (result as { ok: false; reason: string }).reason;
  if (reason === 'no_matches')
    return res.status(400).json({ error: 'No matches found — draw first' });
  if (reason === 'bracket_complete')
    return res.status(409).json({ error: 'Bracket is already complete' });
  if (reason === 'round_not_complete')
    return res.status(409).json({ error: 'Not all current-round matches are complete' });
  if (reason === 'no_winner')
    return res.status(409).json({ error: 'Some matches have no winner set' });
  return res.status(400).json({ error: reason });
});

export default router;
