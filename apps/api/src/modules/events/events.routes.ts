import { Router, type Response } from 'express';
import {
  authOptional,
  authRequired,
  requireAdmin,
  requireSuperadmin,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import {
  listEvents,
  getEventBySlug,
  createEvent,
  updateEvent,
  togglePublished,
  deleteEvent,
  cloneEvent,
} from './events.service';
import type { CreateEventBody, UpdateEventBody } from './events.types';
import { pool } from '../../config/db';
import eventAdminsRouter from './event-admins.routes';
import stagesRouter from '../stages/stages.routes';
import stageTransitionsRouter from '../stages/stage-transitions.routes';
import stageGroupsRouter from '../stages/stage-groups.routes';
import resultAdminRouter from '../results/result-admin.routes';
import eventLeaderboardRouter from '../leaderboards/leaderboards.routes';
import awardsRouter from '../awards/awards.routes';
import ingestionRouter from '../ingestion/ingestion.routes';
import eventTeamResultsRouter from './event-team-results.routes';
import eventSimulationRouter from '../simulation/event-simulation.routes';

const router = Router();

// Sub-routers
router.use('/:slug/admins', eventAdminsRouter);
router.use('/:slug/stages', stagesRouter);
router.use('/:slug/transitions', stageTransitionsRouter);
router.use('/:slug/stage-groups', stageGroupsRouter);
router.use('/:slug/results', resultAdminRouter);
router.use('/:slug/awards', awardsRouter);
router.use('/:slug/pull-replays', ingestionRouter);
router.use('/:slug/teams', eventTeamResultsRouter);
router.use('/:slug', eventSimulationRouter);
router.use('/:slug', eventLeaderboardRouter);

// GET /api/events/:slug/eligibility/me — per-team-size spoiler eligibility for the current user
router.get(
  '/:slug/eligibility/me',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
    const event = await getEventBySlug(slug, isAdmin);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const userId = req.user!.userId;

    const result = await pool.query<{ team_size: number; status: string }>(
      `WITH
         forfeited AS (
           SELECT EXISTS (
             SELECT 1 FROM event_forfeitures WHERE event_id = $1 AND user_id = $2
           ) AS yes
         ),
         user_teams AS (
           SELECT DISTINCT et.id AS team_id, et.team_size
           FROM event_teams et
           JOIN event_team_members etm ON etm.event_team_id = et.id
           WHERE et.event_id = $1
             AND etm.user_id = $2
             AND etm.confirmed = TRUE
         ),
         active_slots AS (
           SELECT esg.id AS slot_id
           FROM event_stage_games esg
           JOIN event_stages es ON es.id = esg.stage_id
           WHERE es.event_id = $1
             AND (es.starts_at IS NULL OR es.starts_at <= NOW())
         ),
         total_active AS (SELECT COUNT(*)::int AS cnt FROM active_slots)
       SELECT
         ut.team_size,
         CASE
           WHEN (SELECT yes FROM forfeited) THEN 'INELIGIBLE'
           WHEN (SELECT cnt FROM total_active) = 0 THEN 'COMPLETED'
           WHEN (
             SELECT COUNT(DISTINCT egr.stage_game_id)
             FROM event_game_results egr
             WHERE egr.event_team_id = ut.team_id
               AND egr.attempt_id IS NULL
               AND egr.stage_game_id IN (SELECT slot_id FROM active_slots)
           ) >= (SELECT cnt FROM total_active) THEN 'COMPLETED'
           ELSE 'ENROLLED'
         END AS status
       FROM user_teams ut
       ORDER BY ut.team_size`,
      [event.id, userId],
    );

    res.json(result.rows);
  },
);

// POST /api/events/:slug/eligibility/spoilers — forfeit eligibility to view spoilers
router.post(
  '/:slug/eligibility/spoilers',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
    const event = await getEventBySlug(slug, isAdmin);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    await pool.query(
      `INSERT INTO event_forfeitures (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [event.id, req.user!.userId],
    );
    res.json({ ok: true });
  },
);

// POST /api/events/:slug/forfeit — player forfeits eligibility to view spoilers
router.post('/:slug/forfeit', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  await pool.query(
    `INSERT INTO event_forfeitures (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [event.id, req.user!.userId],
  );
  res.json({ ok: true });
});

// GET /api/events — list events; admins see drafts too
router.get('/', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const events = await listEvents(isAdmin);
  res.json(events);
});

// GET /api/events/:slug/status — inferred event status + dates
router.get('/:slug/status', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json({
    status: event.status,
    starts_at: event.starts_at,
    ends_at: event.ends_at,
    registration_opens_at: event.registration_opens_at,
    registration_cutoff: event.registration_cutoff,
  });
});

// GET /api/events/:slug — single event; admins can see unpublished
router.get('/:slug', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  res.json(event);
});

// POST /api/events — create event (admin)
router.post('/', authRequired, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const body = req.body as CreateEventBody;

  if (!body.slug || typeof body.slug !== 'string') {
    return res.status(400).json({ error: 'slug is required' });
  }
  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!body.long_description || typeof body.long_description !== 'string') {
    return res.status(400).json({ error: 'long_description is required' });
  }
  if (!Array.isArray(body.allowed_team_sizes) || body.allowed_team_sizes.length === 0) {
    return res.status(400).json({ error: 'allowed_team_sizes must be a non-empty array' });
  }

  try {
    const event = await createEvent(body, req.user!.userId);
    res.status(201).json(event);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return res.status(409).json({ error: 'slug_taken' });
    }
    throw err;
  }
});

// PUT /api/events/:slug — update event (admin)
router.put(
  '/:slug',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const body = req.body as UpdateEventBody;
    const event = await updateEvent(slug, body);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  },
);

// PATCH /api/events/:slug/publish — toggle published (admin)
router.patch(
  '/:slug/publish',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await togglePublished(slug);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  },
);

// POST /api/events/:slug/clone — clone event as a draft (admin)
router.post(
  '/:slug/clone',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const result = await cloneEvent(slug, req.user!.userId);
    if (result === 'not_found') return res.status(404).json({ error: 'Event not found' });
    if (result === 'slug_taken')
      return res
        .status(409)
        .json({ error: `Slug "${slug}-copy" is already taken. Rename the original first.` });
    res.status(201).json(result);
  },
);

// DELETE /api/events/:slug — delete event (superadmin; cascades everything)
router.delete(
  '/:slug',
  authRequired,
  requireSuperadmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const deleted = await deleteEvent(slug);
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    res.status(204).send();
  },
);

export default router;
