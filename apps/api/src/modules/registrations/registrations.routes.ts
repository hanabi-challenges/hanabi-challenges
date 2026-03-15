import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listRegistrations,
  getRegistration,
  registerUser,
  withdrawRegistration,
  adminUpdateRegistration,
  type RegistrationStatus,
  type RegistrationRow,
} from './registrations.service';
import {
  listEventTeams,
  getTeam,
  createEventTeam,
  confirmMembership,
  removeMember,
} from './teams.service';

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveEventForRegistration(
  req: AuthenticatedRequest,
  res: Response,
  includeUnpublished: boolean,
): Promise<{ eventId: number; event: Awaited<ReturnType<typeof getEventBySlug>> } | null> {
  const slug = String(req.params.slug);
  const event = await getEventBySlug(slug, includeUnpublished);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }
  return { eventId: event.id, event };
}

async function requireEventAdmin(
  req: AuthenticatedRequest,
  res: Response,
  eventId: number,
): Promise<boolean> {
  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  if (isSuperadmin) return true;
  const role = await getEventAdminRole(eventId, req.user!.userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// POST /api/events/:slug/register — register current user
// ---------------------------------------------------------------------------

router.post(
  '/events/:slug/register',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, false);
    if (!ctx) return;

    const result = await registerUser(ctx.eventId, req.user!.userId, {
      registration_cutoff: ctx.event!.registration_cutoff,
      allow_late_registration: ctx.event!.allow_late_registration,
    });

    if (!result.ok) {
      return res.status(409).json({ error: 'Registration is closed for this event' });
    }

    res.status(201).json(result.registration);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/register — withdraw current user's registration
// ---------------------------------------------------------------------------

router.delete(
  '/events/:slug/register',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const result = await withdrawRegistration(ctx.eventId, req.user!.userId);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_registered') {
        return res.status(404).json({ error: 'No active registration found' });
      }
      return res
        .status(409)
        .json({ error: 'Cannot withdraw: stage-scoped team results exist for this user' });
    }

    const okResult = result as { ok: true; registration: RegistrationRow; warning?: string };
    const body: Record<string, unknown> = { ...okResult.registration };
    if (okResult.warning) body.warning = okResult.warning;
    res.json(body);
  },
);

// ---------------------------------------------------------------------------
// GET /api/events/:slug/registrations/me — current user's registration
// ---------------------------------------------------------------------------

router.get(
  '/events/:slug/registrations/me',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const reg = await getRegistration(ctx.eventId, req.user!.userId);
    if (!reg) return res.status(404).json({ error: 'Not registered' });
    res.json(reg);
  },
);

// ---------------------------------------------------------------------------
// GET /api/events/:slug/registrations — list all registrations (admin only)
// ---------------------------------------------------------------------------

router.get(
  '/events/:slug/registrations',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const allowed = await requireEventAdmin(req, res, ctx.eventId);
    if (!allowed) return;

    const registrations = await listRegistrations(ctx.eventId);
    res.json(registrations);
  },
);

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/registrations/:userId — admin update status
// ---------------------------------------------------------------------------

router.patch(
  '/events/:slug/registrations/:userId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const allowed = await requireEventAdmin(req, res, ctx.eventId);
    if (!allowed) return;

    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const newStatus = req.body?.status as RegistrationStatus;
    if (!newStatus) {
      return res.status(400).json({ error: 'status is required' });
    }

    const result = await adminUpdateRegistration(ctx.eventId, targetUserId, newStatus);
    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_found') {
        return res.status(404).json({ error: 'Registration not found' });
      }
      return res.status(400).json({ error: 'status must be PENDING, ACTIVE, or WITHDRAWN' });
    }

    res.json((result as { ok: true; registration: RegistrationRow }).registration);
  },
);

// ---------------------------------------------------------------------------
// GET /api/events/:slug/teams — list teams (admin: all; user: own teams)
// ---------------------------------------------------------------------------

router.get(
  '/events/:slug/teams',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const isSuperadmin = req.user!.role === 'SUPERADMIN';
    const role = isSuperadmin
      ? 'SUPERADMIN'
      : await getEventAdminRole(ctx.eventId, req.user!.userId);
    const isAdmin = role !== null;

    const teams = await listEventTeams(ctx.eventId, isAdmin ? undefined : req.user!.userId);
    res.json(teams);
  },
);

// ---------------------------------------------------------------------------
// GET /api/events/:slug/teams/:teamId — team detail
// ---------------------------------------------------------------------------

router.get(
  '/events/:slug/teams/:teamId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: 'Invalid teamId' });
    }

    const team = await getTeam(teamId, ctx.eventId);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  },
);

// ---------------------------------------------------------------------------
// POST /api/events/:slug/teams — create team
// ---------------------------------------------------------------------------

router.post(
  '/events/:slug/teams',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const inviteUserIds: number[] = Array.isArray(req.body?.invite_user_ids)
      ? req.body.invite_user_ids.map(Number).filter(Number.isInteger)
      : [];

    const result = await createEventTeam(
      ctx.eventId,
      req.user!.userId,
      inviteUserIds,
      ctx.event!.allowed_team_sizes,
    );

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'invalid_size') {
        return res.status(400).json({
          error: `Team size must be one of: ${ctx.event!.allowed_team_sizes.join(', ')}`,
        });
      }
      if (reason === 'not_registered') {
        return res
          .status(409)
          .json({ error: 'All team members must have an active event registration' });
      }
      return res
        .status(409)
        .json({ error: 'One or more members already belong to a confirmed team for this event' });
    }

    res.status(201).json((result as { ok: true; team: unknown }).team);
  },
);

// ---------------------------------------------------------------------------
// POST /api/events/:slug/teams/:teamId/confirm — confirm membership
// ---------------------------------------------------------------------------

router.post(
  '/events/:slug/teams/:teamId/confirm',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const teamId = Number(req.params.teamId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: 'Invalid teamId' });
    }

    const result = await confirmMembership(teamId, ctx.eventId, req.user!.userId);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_invited') {
        return res.status(404).json({ error: 'You are not invited to this team' });
      }
      return res.status(409).json({ error: 'Membership already confirmed' });
    }

    res.json((result as { ok: true; team: unknown }).team);
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/teams/:teamId/members/:userId — remove member
// ---------------------------------------------------------------------------

router.delete(
  '/events/:slug/teams/:teamId/members/:userId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventForRegistration(req, res, true);
    if (!ctx) return;

    const teamId = Number(req.params.teamId);
    const targetUserId = Number(req.params.userId);
    if (!Number.isInteger(teamId) || teamId <= 0) {
      return res.status(400).json({ error: 'Invalid teamId' });
    }
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    // Only the target user themselves, or an event admin, can remove a member
    const isSuperadmin = req.user!.role === 'SUPERADMIN';
    const isSelf = req.user!.userId === targetUserId;
    if (!isSelf && !isSuperadmin) {
      const role = await getEventAdminRole(ctx.eventId, req.user!.userId);
      if (!role) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    const result = await removeMember(teamId, ctx.eventId, targetUserId);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_member') {
        return res.status(404).json({ error: 'User is not a member of this team' });
      }
      return res.status(409).json({ error: 'Cannot remove member: team has submitted results' });
    }

    res.status(204).send();
  },
);

export default router;
