import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { listStageTeams, createStageTeam } from '../registrations/teams.service';

// Mounted at /api/events/:slug/stages/:stageId/teams (mergeParams: true)
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{
  eventId: number;
  stageId: number;
  event: Awaited<ReturnType<typeof getEventBySlug>>;
} | null> {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
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

  return { eventId: event.id, stageId, event };
}

// GET /api/events/:slug/stages/:stageId/teams/me — must come before /:teamId
router.get('/me', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const teams = await listStageTeams(ctx.eventId, ctx.stageId, req.user!.userId);
  // Return the first (should be at most one active team per stage per user)
  if (teams.length === 0) return res.status(404).json({ error: 'No team found for this stage' });
  res.json(teams[0]);
});

// GET /api/events/:slug/stages/:stageId/teams
router.get('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const isSuperadmin = req.user!.role === 'SUPERADMIN';
  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(ctx.eventId, req.user!.userId);
  const isAdmin = role !== null;

  const teams = await listStageTeams(
    ctx.eventId,
    ctx.stageId,
    isAdmin ? undefined : req.user!.userId,
  );
  res.json(teams);
});

// POST /api/events/:slug/stages/:stageId/teams
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const inviteUserIds: number[] = Array.isArray(req.body?.invite_user_ids)
    ? req.body.invite_user_ids.map(Number).filter(Number.isInteger)
    : [];

  const result = await createStageTeam(
    ctx.eventId,
    ctx.stageId,
    req.user!.userId,
    inviteUserIds,
    ctx.event!.allowed_team_sizes,
    {
      registration_cutoff: ctx.event!.registration_cutoff,
      allow_late_registration: ctx.event!.allow_late_registration,
    },
  );

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'invalid_size') {
      return res.status(400).json({
        error: `Team size must be one of: ${ctx.event!.allowed_team_sizes.join(', ')}`,
      });
    }
    if (reason === 'registration_closed') {
      return res.status(409).json({ error: 'Registration has closed for this event' });
    }
    return res
      .status(409)
      .json({ error: 'One or more members already belong to a confirmed team for this stage' });
  }

  res.status(201).json((result as { ok: true; team: unknown }).team);
});

export default router;
