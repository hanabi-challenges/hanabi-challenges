import { Router, type Response } from 'express';
import { authRequired, hasRole, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { listOptIns, getMyOptIn, createOptIn, deleteOptIn } from './opt-ins.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   GET  /opt-ins       — admin: list all
//   GET  /opt-ins/me    — current user's opt-in status
//   POST /opt-in        — opt in
//   DELETE /opt-in      — opt out
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; stageId: number } | null> {
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

  const isGlobalAdmin = hasRole(req.user, 'HOST');
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

  return { eventId: event.id, stageId };
}

// GET /api/events/:slug/stages/:stageId/opt-ins/me
router.get('/opt-ins/me', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const optIn = await getMyOptIn(ctx.stageId, req.user!.userId);
  if (!optIn) return res.status(404).json({ error: 'No opt-in found for this stage' });
  res.json(optIn);
});

// GET /api/events/:slug/stages/:stageId/opt-ins — admin only
router.get('/opt-ins', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const userId = req.user?.userId;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const isSuperadmin = req.user?.roles?.includes('SUPERADMIN') ?? false;
  const event = await getEventBySlug(slug, true);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const stage = await getStage(event.id, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  if (!role) return res.status(403).json({ error: 'Forbidden' });

  const optIns = await listOptIns(stageId);
  res.json(optIns);
});

// POST /api/events/:slug/stages/:stageId/opt-in
router.post('/opt-in', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const partnerUserId: number | null =
    req.body?.partner_user_id !== undefined && req.body.partner_user_id !== null
      ? Number(req.body.partner_user_id)
      : null;

  if (partnerUserId !== null && (!Number.isInteger(partnerUserId) || partnerUserId <= 0)) {
    return res.status(400).json({ error: 'Invalid partner_user_id' });
  }

  const result = await createOptIn(ctx.stageId, ctx.eventId, req.user!.userId, partnerUserId);

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'wrong_stage_policy') {
      return res.status(409).json({ error: 'Stage does not use QUEUED team policy' });
    }
    if (reason === 'not_registered') {
      return res.status(409).json({ error: 'You must be registered for this event to opt in' });
    }
    if (reason === 'partner_not_registered') {
      return res.status(409).json({ error: 'Partner must be registered for this event' });
    }
    return res.status(409).json({ error: 'You have already opted in to this stage' });
  }

  res.status(201).json((result as { ok: true; optIn: unknown }).optIn);
});

// DELETE /api/events/:slug/stages/:stageId/opt-in
router.delete('/opt-in', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const result = await deleteOptIn(ctx.stageId, req.user!.userId);

  if (result.ok === false) {
    return res.status(404).json({ error: 'No opt-in found for this stage' });
  }

  res.status(204).send();
});

export default router;
