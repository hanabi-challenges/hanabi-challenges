import { Router, type Response } from 'express';
import {
  authOptional,
  authRequired,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listStages,
  getStage,
  createStage,
  updateStage,
  reorderStage,
  bulkReorderStages,
  deleteStage,
  cloneStage,
} from './stages.service';
import { assignStageToGroup } from './stage-groups.service';
import type { CreateStageBody, UpdateStageBody } from './stages.types';
import gamesRouter from './games.routes';
import stageTeamsRouter from './stage-teams.routes';
import optInsRouter from './opt-ins.routes';
import drawRouter from './draw.routes';
import stageResultsRouter from './stage-results.routes';
import attemptsRouter from './attempts.routes';
import matchesRouter from './matches.routes';
import leaderboardRouter from './leaderboard.routes';
import bracketEntriesRouter from './bracket-entries.routes';
import bracketRouter from './bracket.routes';
import simulationRouter from '../simulation/simulation.routes';

const VALID_MECHANISMS = ['SEEDED_LEADERBOARD', 'GAUNTLET', 'MATCH_PLAY'] as const;
const VALID_PARTICIPATION_TYPES = ['INDIVIDUAL', 'TEAM'] as const;
const VALID_TEAM_SCOPES = ['EVENT', 'STAGE'] as const;
const VALID_ATTEMPT_POLICIES = ['SINGLE', 'REQUIRED_ALL', 'BEST_OF_N', 'UNLIMITED_BEST'] as const;
const VALID_TIME_POLICIES = ['WINDOW', 'ROLLING', 'SCHEDULED'] as const;

// Mounted at /api/events/:slug/stages via events.routes.ts (mergeParams: true)
const router = Router({ mergeParams: true });

// PATCH /api/events/:slug/stages/reorder-bulk — set all stage_index values at once (admin)
// Must be before /:stageId sub-router mounts so 'reorder-bulk' isn't treated as a stageId.
router.patch('/reorder-bulk', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const { stage_ids } = req.body as { stage_ids?: unknown };
  if (
    !Array.isArray(stage_ids) ||
    stage_ids.some((id) => !Number.isInteger(id) || (id as number) <= 0)
  ) {
    return res.status(400).json({ error: 'stage_ids must be an array of positive integers' });
  }

  await bulkReorderStages(ctx.eventId, stage_ids as number[]);
  res.status(204).send();
});

// Sub-routers
router.use('/:stageId/games', gamesRouter);
router.use('/:stageId/teams', stageTeamsRouter);
router.use('/:stageId', optInsRouter);
router.use('/:stageId', drawRouter);
router.use('/:stageId', stageResultsRouter);
router.use('/:stageId', attemptsRouter);
router.use('/:stageId', matchesRouter);
router.use('/:stageId', leaderboardRouter);
router.use('/:stageId', bracketEntriesRouter);
router.use('/:stageId', bracketRouter);
router.use('/:stageId', simulationRouter);

// ---------------------------------------------------------------------------
// Permission helper — resolves event from :slug, checks if caller is an admin
// ---------------------------------------------------------------------------
async function resolveEventAndAdminCheck(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number } | null> {
  const slug = String(req.params.slug);
  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  if (isSuperadmin) return { eventId: event.id };

  const role = await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { eventId: event.id };
}

// GET /api/events/:slug/stages — list stages (public for published events, admin sees all)
router.get('/', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const stages = await listStages(event.id);
  res.json(stages);
});

// GET /api/events/:slug/stages/:stageId/status — inferred stage status
router.get('/:stageId/status', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const stage = await getStage(event.id, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });
  res.json({ status: stage.status, starts_at: stage.starts_at, ends_at: stage.ends_at });
});

// GET /api/events/:slug/stages/:stageId — single stage
router.get('/:stageId', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  const stage = await getStage(event.id, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });
  res.json(stage);
});

// POST /api/events/:slug/stages — create stage (admin)
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const body = req.body as CreateStageBody;

  if (!body.label || typeof body.label !== 'string') {
    return res.status(400).json({ error: 'label is required' });
  }
  if (!VALID_MECHANISMS.includes(body.mechanism as (typeof VALID_MECHANISMS)[number])) {
    return res
      .status(400)
      .json({ error: `mechanism must be one of: ${VALID_MECHANISMS.join(', ')}` });
  }
  if (
    !VALID_PARTICIPATION_TYPES.includes(
      body.participation_type as (typeof VALID_PARTICIPATION_TYPES)[number],
    )
  ) {
    return res.status(400).json({
      error: `participation_type must be one of: ${VALID_PARTICIPATION_TYPES.join(', ')}`,
    });
  }
  if (!VALID_TEAM_SCOPES.includes(body.team_scope as (typeof VALID_TEAM_SCOPES)[number])) {
    return res
      .status(400)
      .json({ error: `team_scope must be one of: ${VALID_TEAM_SCOPES.join(', ')}` });
  }
  if (
    !VALID_ATTEMPT_POLICIES.includes(body.attempt_policy as (typeof VALID_ATTEMPT_POLICIES)[number])
  ) {
    return res
      .status(400)
      .json({ error: `attempt_policy must be one of: ${VALID_ATTEMPT_POLICIES.join(', ')}` });
  }
  if (!VALID_TIME_POLICIES.includes(body.time_policy as (typeof VALID_TIME_POLICIES)[number])) {
    return res
      .status(400)
      .json({ error: `time_policy must be one of: ${VALID_TIME_POLICIES.join(', ')}` });
  }

  const stage = await createStage(ctx.eventId, body);
  res.status(201).json(stage);
});

// PUT /api/events/:slug/stages/:stageId — update stage (admin)
router.put('/:stageId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const body = req.body as UpdateStageBody;

  if (
    body.participation_type !== undefined &&
    !VALID_PARTICIPATION_TYPES.includes(
      body.participation_type as (typeof VALID_PARTICIPATION_TYPES)[number],
    )
  ) {
    return res.status(400).json({
      error: `participation_type must be one of: ${VALID_PARTICIPATION_TYPES.join(', ')}`,
    });
  }
  if (
    body.team_scope !== undefined &&
    !VALID_TEAM_SCOPES.includes(body.team_scope as (typeof VALID_TEAM_SCOPES)[number])
  ) {
    return res
      .status(400)
      .json({ error: `team_scope must be one of: ${VALID_TEAM_SCOPES.join(', ')}` });
  }
  if (
    body.attempt_policy !== undefined &&
    !VALID_ATTEMPT_POLICIES.includes(body.attempt_policy as (typeof VALID_ATTEMPT_POLICIES)[number])
  ) {
    return res
      .status(400)
      .json({ error: `attempt_policy must be one of: ${VALID_ATTEMPT_POLICIES.join(', ')}` });
  }
  if (
    body.time_policy !== undefined &&
    !VALID_TIME_POLICIES.includes(body.time_policy as (typeof VALID_TIME_POLICIES)[number])
  ) {
    return res
      .status(400)
      .json({ error: `time_policy must be one of: ${VALID_TIME_POLICIES.join(', ')}` });
  }

  const stage = await updateStage(ctx.eventId, stageId, body);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });
  res.json(stage);
});

// PATCH /api/events/:slug/stages/:stageId/reorder — update stage_index
router.patch(
  '/:stageId/reorder',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const stageId = Number(req.params.stageId);
    if (!Number.isInteger(stageId) || stageId <= 0) {
      return res.status(400).json({ error: 'Invalid stageId' });
    }

    const newIndex = Number(req.body?.stage_index);
    if (!Number.isInteger(newIndex) || newIndex < 0) {
      return res.status(400).json({ error: 'stage_index must be a non-negative integer' });
    }

    const stage = await reorderStage(ctx.eventId, stageId, newIndex);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    res.json(stage);
  },
);

// POST /api/events/:slug/stages/:stageId/clone — clone stage (admin)
router.post('/:stageId/clone', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const stage = await cloneStage(ctx.eventId, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });
  res.status(201).json(stage);
});

// PATCH /api/events/:slug/stages/:stageId/group — assign stage to a group (or ungroup)
router.patch('/:stageId/group', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  // group_id: number assigns; null ungroups
  const rawGroupId = req.body?.group_id;
  const groupId = rawGroupId === null || rawGroupId === undefined ? null : Number(rawGroupId);

  if (groupId !== null && (!Number.isInteger(groupId) || groupId <= 0)) {
    return res.status(400).json({ error: 'group_id must be a positive integer or null' });
  }

  const stage = await assignStageToGroup(ctx.eventId, stageId, groupId);
  if (!stage) return res.status(404).json({ error: 'Stage or group not found' });
  res.json(stage);
});

// DELETE /api/events/:slug/stages/:stageId — delete stage (admin; blocked if results exist)
router.delete('/:stageId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const result = await deleteStage(ctx.eventId, stageId);
  if (result === 'has_results') {
    return res.status(409).json({ error: 'Cannot delete a stage that has game results' });
  }
  if (!result) return res.status(404).json({ error: 'Stage not found' });
  res.status(204).send();
});

export default router;
