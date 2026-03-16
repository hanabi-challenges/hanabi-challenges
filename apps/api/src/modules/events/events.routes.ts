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
import eventAdminsRouter from './event-admins.routes';
import stagesRouter from '../stages/stages.routes';
import stageRelationshipsRouter from '../stages/stage-relationships.routes';
import resultAdminRouter from '../results/result-admin.routes';
import eventLeaderboardRouter from '../leaderboards/leaderboards.routes';
import awardsRouter from '../awards/awards.routes';

const router = Router();

// Sub-routers
router.use('/:slug/admins', eventAdminsRouter);
router.use('/:slug/stages', stagesRouter);
router.use('/:slug/stage-relationships', stageRelationshipsRouter);
router.use('/:slug/results', resultAdminRouter);
router.use('/:slug/awards', awardsRouter);
router.use('/:slug', eventLeaderboardRouter);

// GET /api/events — list published events (public)
router.get('/', authOptional, async (_req: AuthenticatedRequest, res: Response) => {
  const events = await listEvents();
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
      return res.status(409).json({ error: 'An event with that slug or name already exists' });
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
