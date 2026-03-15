import { Router, type Response } from 'express';
import {
  authOptional,
  authRequired,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import {
  listGameSlots,
  getGameSlot,
  createGameSlot,
  createGameSlotsBatch,
  updateGameSlot,
  deleteGameSlot,
  propagateGames,
  type CreateGameSlotBody,
  type UpdateGameSlotBody,
} from './games.service';
import gameResultsRouter from './game-results.routes';

// Mounted at /api/events/:slug/stages/:stageId/games (mergeParams: true)
const router = Router({ mergeParams: true });

// Sub-routers — must be registered before /:gameId literal routes
router.use('/:gameId', gameResultsRouter);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveStageAndAdminCheck(
  req: AuthenticatedRequest,
  res: Response,
  requireAdmin: boolean,
): Promise<{ eventId: number; stageId: number } | null> {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
    return null;
  }

  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const isGlobalAdmin = req.user?.role === 'ADMIN' || isSuperadmin;
  // For admin-required paths, always include unpublished so we can return 403 rather than 404
  const event = await getEventBySlug(slug, requireAdmin || isGlobalAdmin);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  if (!requireAdmin) return { eventId: event.id, stageId };

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (isSuperadmin) return { eventId: event.id, stageId };

  const role = await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { eventId: event.id, stageId };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /api/events/:slug/stages/:stageId/games
router.get('/', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, false);
  if (!ctx) return;

  const teamSize = req.query.team_size !== undefined ? Number(req.query.team_size) : undefined;
  if (teamSize !== undefined && (!Number.isInteger(teamSize) || teamSize <= 0)) {
    return res.status(400).json({ error: 'Invalid team_size filter' });
  }

  const slots = await listGameSlots(ctx.stageId, teamSize);
  res.json(slots);
});

// GET /api/events/:slug/stages/:stageId/games/:gameId
router.get('/:gameId', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, false);
  if (!ctx) return;

  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Invalid gameId' });
  }

  const slot = await getGameSlot(ctx.stageId, gameId);
  if (!slot) return res.status(404).json({ error: 'Game slot not found' });
  res.json(slot);
});

// POST /api/events/:slug/stages/:stageId/games/propagate — must come before /:gameId
router.post('/propagate', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const overrideExisting = req.body?.override_existing === true;
  await propagateGames(ctx.stageId, overrideExisting);
  const slots = await listGameSlots(ctx.stageId);
  res.json(slots);
});

// POST /api/events/:slug/stages/:stageId/games/batch — must come before /:gameId
router.post('/batch', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const slots = req.body?.slots;
  if (!Array.isArray(slots) || slots.length === 0) {
    return res.status(400).json({ error: 'slots must be a non-empty array' });
  }

  for (const slot of slots as unknown[]) {
    if (
      typeof slot !== 'object' ||
      slot === null ||
      !Number.isInteger((slot as Record<string, unknown>).game_index) ||
      Number((slot as Record<string, unknown>).game_index) < 0
    ) {
      return res.status(400).json({ error: 'Each slot must have a valid game_index' });
    }
  }

  const result = await createGameSlotsBatch(ctx.stageId, slots as CreateGameSlotBody[]);
  res.status(201).json(result);
});

// POST /api/events/:slug/stages/:stageId/games
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const body = req.body as CreateGameSlotBody;
  if (!Number.isInteger(body.game_index) || body.game_index < 0) {
    return res.status(400).json({ error: 'game_index must be a non-negative integer' });
  }

  const result = await createGameSlot(ctx.stageId, body);
  if (result === 'duplicate') {
    return res
      .status(409)
      .json({ error: 'A game slot with that index and team_size already exists' });
  }
  res.status(201).json(result);
});

// PUT /api/events/:slug/stages/:stageId/games/:gameId
router.put('/:gameId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Invalid gameId' });
  }

  const body = req.body as UpdateGameSlotBody;
  const updated = await updateGameSlot(ctx.stageId, gameId, body);
  if (!updated) return res.status(404).json({ error: 'Game slot not found' });
  res.json(updated);
});

// DELETE /api/events/:slug/stages/:stageId/games/:gameId
router.delete('/:gameId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Invalid gameId' });
  }

  const result = await deleteGameSlot(ctx.stageId, gameId);
  if (result === 'has_results') {
    return res.status(409).json({ error: 'Cannot delete a game slot that has results' });
  }
  if (!result) return res.status(404).json({ error: 'Game slot not found' });
  res.status(204).send();
});

export default router;
