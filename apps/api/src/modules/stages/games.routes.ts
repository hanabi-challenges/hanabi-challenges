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
  bulkAddGameSlots,
  updateGameSlot,
  reorderGameSlot,
  deleteGameSlot,
  checkSeedConflicts,
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
  const slots = await listGameSlots(ctx.stageId);
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

// POST /api/events/:slug/stages/:stageId/games/bulk — must come before /:gameId
router.post('/bulk', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    return res.status(400).json({ error: 'count must be an integer between 1 and 100' });
  }

  const seeds: unknown = req.body?.seeds;
  if (seeds !== undefined && seeds !== null) {
    if (!Array.isArray(seeds) || seeds.some((s) => typeof s !== 'string')) {
      return res.status(400).json({ error: 'seeds must be an array of strings' });
    }
    if ((seeds as string[]).length !== count) {
      return res.status(400).json({ error: 'seeds length must equal count' });
    }
  }

  if (seeds) {
    const conflicts = await checkSeedConflicts(ctx.eventId, seeds as string[]);
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: `Seeds already used in another event: ${conflicts.join(', ')}`,
      });
    }
  }

  const created = await bulkAddGameSlots(ctx.stageId, count, seeds as string[] | undefined);
  res.status(201).json(created);
});

// POST /api/events/:slug/stages/:stageId/games — single slot (auto-assigns index)
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const body = req.body as CreateGameSlotBody;

  if (body.seed_payload) {
    const conflicts = await checkSeedConflicts(ctx.eventId, [body.seed_payload]);
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: `Seed already used in another event: ${conflicts[0]}`,
      });
    }
  }

  const slot = await createGameSlot(ctx.stageId, body);
  res.status(201).json(slot);
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

  if (body.seed_payload) {
    const conflicts = await checkSeedConflicts(ctx.eventId, [body.seed_payload]);
    if (conflicts.length > 0) {
      return res.status(409).json({
        error: `Seed already used in another event: ${conflicts[0]}`,
      });
    }
  }

  const updated = await updateGameSlot(ctx.stageId, gameId, body);
  if (!updated) return res.status(404).json({ error: 'Game slot not found' });
  res.json(updated);
});

// PATCH /api/events/:slug/stages/:stageId/games/:gameId/reorder
router.patch('/:gameId/reorder', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveStageAndAdminCheck(req, res, true);
  if (!ctx) return;

  const gameId = Number(req.params.gameId);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return res.status(400).json({ error: 'Invalid gameId' });
  }

  const newIndex = Number(req.body?.game_index);
  if (!Number.isInteger(newIndex) || newIndex < 0) {
    return res.status(400).json({ error: 'game_index must be a non-negative integer' });
  }

  const slot = await reorderGameSlot(ctx.stageId, gameId, newIndex);
  if (!slot) return res.status(404).json({ error: 'Game slot not found' });
  res.json(slot);
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
