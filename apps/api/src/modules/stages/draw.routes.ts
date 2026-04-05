import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { previewDraw, confirmDraw, resetDraw } from './draw.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   POST /draw          — admin: preview draw (no persistence)
//   POST /draw/confirm  — admin: persist teams from draw
//   POST /draw/reset    — admin: delete QUEUED teams for this stage
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveAdminContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; stageId: number; allowedTeamSizes: number[] } | null> {
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

  const isSuperadmin = req.user?.roles?.includes('SUPERADMIN') ?? false;
  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  return { eventId: event.id, stageId, allowedTeamSizes: event.allowed_team_sizes };
}

// POST /api/events/:slug/stages/:stageId/draw — preview (no persistence)
router.post('/draw', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  const result = await previewDraw(ctx.stageId, ctx.allowedTeamSizes);

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'wrong_stage_policy') {
      return res.status(409).json({ error: 'Stage does not use QUEUED team policy' });
    }
    return res
      .status(409)
      .json({ error: 'Teams already exist for this stage; reset before drawing again' });
  }

  res.json((result as { ok: true; proposal: unknown }).proposal);
});

// POST /api/events/:slug/stages/:stageId/draw/confirm — persist teams
router.post('/draw/confirm', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  const result = await confirmDraw(ctx.eventId, ctx.stageId, ctx.allowedTeamSizes);

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'wrong_stage_policy') {
      return res.status(409).json({ error: 'Stage does not use QUEUED team policy' });
    }
    return res
      .status(409)
      .json({ error: 'Teams already exist for this stage; reset before drawing again' });
  }

  res.status(201).json((result as { ok: true; teams: unknown }).teams);
});

// POST /api/events/:slug/stages/:stageId/draw/reset — delete QUEUED teams
router.post('/draw/reset', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  const result = await resetDraw(ctx.stageId);

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'wrong_stage_policy') {
      return res.status(409).json({ error: 'Stage does not use QUEUED team policy' });
    }
    return res.status(409).json({ error: 'Cannot reset a draw that has game results' });
  }

  res.json({ deleted_count: (result as { ok: true; deleted_count: number }).deleted_count });
});

export default router;
