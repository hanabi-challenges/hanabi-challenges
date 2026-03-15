import { Router, type Response } from 'express';
import {
  authRequired,
  authOptional,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import {
  listAttempts,
  listAllAttempts,
  getAttemptDetail,
  startAttempt,
  abandonAttempt,
  completeAttempt,
} from './attempts.service';
import { getGauntletLeaderboard } from '../leaderboards/leaderboards.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   POST /attempts                      — start new attempt
//   GET  /attempts                      — list attempts (own team or all for admin)
//   GET  /attempts/:attemptId           — attempt detail
//   POST /attempts/:attemptId/complete  — mark attempt complete
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; stageId: number; isAdmin: boolean } | null> {
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

  const isGlobalAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
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

  const isSuperadmin = req.user!.role === 'SUPERADMIN';
  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  const isAdmin = role !== null;

  return { eventId: event.id, stageId, isAdmin };
}

// GET /api/events/:slug/stages/:stageId/attempts/leaderboard — T-042 (public)
router.get(
  '/attempts/leaderboard',
  authOptional,
  async (req: AuthenticatedRequest, res: Response) => {
    const stageId = Number(req.params.stageId);
    if (!Number.isInteger(stageId) || stageId <= 0) {
      return res.status(400).json({ error: 'Invalid stageId' });
    }

    const leaderboard = await getGauntletLeaderboard(stageId);
    if (!leaderboard) return res.status(404).json({ error: 'Stage not found' });
    res.json(leaderboard);
  },
);

// POST /api/events/:slug/stages/:stageId/attempts
router.post('/attempts', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const result = await startAttempt(ctx.stageId, req.user!.userId);

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'wrong_stage_mechanism') {
      return res.status(409).json({ error: 'Stage does not use GAUNTLET mechanism' });
    }
    if (reason === 'no_team') {
      return res.status(409).json({ error: 'You do not have a confirmed team for this stage' });
    }
    if (reason === 'attempt_limit_reached') {
      return res.status(409).json({ error: 'Attempt limit reached for this stage' });
    }
    return res
      .status(409)
      .json({ error: 'You have an in-progress attempt; complete it before starting a new one' });
  }

  res.status(201).json((result as { ok: true; attempt: unknown }).attempt);
});

// GET /api/events/:slug/stages/:stageId/attempts
router.get('/attempts', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  if (ctx.isAdmin) {
    const attempts = await listAllAttempts(ctx.stageId);
    return res.json(attempts);
  }

  // For regular users, find their team for this stage
  const { pool } = await import('../../config/db');
  const teamResult = await pool.query<{ id: number }>(
    `SELECT DISTINCT et.id
     FROM event_teams et
     JOIN event_team_members etm ON etm.event_team_id = et.id
     WHERE et.stage_id = $1 AND etm.user_id = $2 AND etm.confirmed = TRUE
     LIMIT 1`,
    [ctx.stageId, req.user!.userId],
  );

  if (teamResult.rowCount === 0) {
    return res.json([]);
  }

  const attempts = await listAttempts(ctx.stageId, teamResult.rows[0].id);
  res.json(attempts);
});

// GET /api/events/:slug/stages/:stageId/attempts/:attemptId
router.get(
  '/attempts/:attemptId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;

    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ error: 'Invalid attemptId' });
    }

    const detail = await getAttemptDetail(attemptId, ctx.stageId);
    if (!detail) return res.status(404).json({ error: 'Attempt not found' });

    // Non-admins can only view attempts belonging to their team
    if (!ctx.isAdmin) {
      const { pool } = await import('../../config/db');
      const memberCheck = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM event_team_members
       WHERE event_team_id = $1 AND user_id = $2`,
        [detail.event_team_id, req.user!.userId],
      );
      if (parseInt(memberCheck.rows[0].count, 10) === 0) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    res.json(detail);
  },
);

// DELETE /api/events/:slug/stages/:stageId/attempts/:attemptId — abandon attempt
router.delete(
  '/attempts/:attemptId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;

    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ error: 'Invalid attemptId' });
    }

    const result = await abandonAttempt(attemptId, ctx.stageId, req.user!.userId, ctx.isAdmin);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_found') return res.status(404).json({ error: 'Attempt not found' });
      if (reason === 'already_completed')
        return res.status(409).json({ error: 'Cannot abandon a completed attempt' });
      if (reason === 'already_abandoned')
        return res.status(409).json({ error: 'Attempt is already abandoned' });
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.status(204).send();
  },
);

// POST /api/events/:slug/stages/:stageId/attempts/:attemptId/complete
router.post(
  '/attempts/:attemptId/complete',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res);
    if (!ctx) return;

    const attemptId = Number(req.params.attemptId);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ error: 'Invalid attemptId' });
    }

    const result = await completeAttempt(attemptId, ctx.stageId, req.user!.userId, ctx.isAdmin);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_found') return res.status(404).json({ error: 'Attempt not found' });
      if (reason === 'already_completed')
        return res.status(409).json({ error: 'Attempt is already completed' });
      if (reason === 'missing_results')
        return res
          .status(409)
          .json({ error: 'Not all game slots have been submitted for this attempt' });
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json((result as { ok: true; attempt: unknown }).attempt);
  },
);

export default router;
