import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listStageTransitions,
  upsertTransitionAfterStage,
  upsertTransitionAfterGroup,
  deleteStageTransition,
  type UpsertTransitionBody,
  type TeamAssignmentConfig,
} from './stage-transitions.service';

const VALID_FILTER_TYPES = ['ALL', 'TOP_N', 'THRESHOLD', 'MANUAL'] as const;
const VALID_SEEDING_METHODS = ['PRESERVE', 'RANKED', 'RANDOM', 'MANUAL'] as const;
const VALID_ASSIGNMENT_ALGORITHMS = ['RANDOM', 'BALANCED', 'MANUAL'] as const;

// Mounted at /api/events/:slug/transitions via events.routes.ts (mergeParams: true)
const router = Router({ mergeParams: true });

async function resolveEventAndAdminCheck(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number } | null> {
  const slug = String(req.params.slug);
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

  if (req.user?.role === 'SUPERADMIN') return { eventId: event.id };

  const role = await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { eventId: event.id };
}

function validateUpsertBody(
  body: Partial<UpsertTransitionBody>,
  res: Response,
): UpsertTransitionBody | null {
  if (!VALID_FILTER_TYPES.includes(body.filter_type as (typeof VALID_FILTER_TYPES)[number])) {
    res.status(400).json({ error: `filter_type must be one of: ${VALID_FILTER_TYPES.join(', ')}` });
    return null;
  }
  if (
    (body.filter_type === 'TOP_N' || body.filter_type === 'THRESHOLD') &&
    (body.filter_value == null || !Number.isInteger(Number(body.filter_value)))
  ) {
    res.status(400).json({ error: 'filter_value is required for TOP_N and THRESHOLD' });
    return null;
  }
  if (
    body.seeding_method !== undefined &&
    !VALID_SEEDING_METHODS.includes(body.seeding_method as (typeof VALID_SEEDING_METHODS)[number])
  ) {
    res
      .status(400)
      .json({ error: `seeding_method must be one of: ${VALID_SEEDING_METHODS.join(', ')}` });
    return null;
  }
  if (body.team_assignment_config !== undefined && body.team_assignment_config !== null) {
    const cfg = body.team_assignment_config as Partial<TeamAssignmentConfig>;
    if (
      !VALID_ASSIGNMENT_ALGORITHMS.includes(
        cfg.algorithm as (typeof VALID_ASSIGNMENT_ALGORITHMS)[number],
      )
    ) {
      res.status(400).json({
        error: `team_assignment_config.algorithm must be one of: ${VALID_ASSIGNMENT_ALGORITHMS.join(', ')}`,
      });
      return null;
    }
    if (!Number.isInteger(cfg.team_size) || (cfg.team_size ?? 0) < 2) {
      res.status(400).json({ error: 'team_assignment_config.team_size must be an integer >= 2' });
      return null;
    }
  }
  return body as UpsertTransitionBody;
}

// GET /api/events/:slug/transitions
router.get('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;
  const transitions = await listStageTransitions(ctx.eventId);
  res.json(transitions);
});

// PUT /api/events/:slug/transitions/after-stage/:stageId
router.put(
  '/after-stage/:stageId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const stageId = Number(req.params.stageId);
    if (!Number.isInteger(stageId) || stageId <= 0) {
      return res.status(400).json({ error: 'Invalid stageId' });
    }

    const body = validateUpsertBody(req.body as Partial<UpsertTransitionBody>, res);
    if (!body) return;

    const result = await upsertTransitionAfterStage(ctx.eventId, stageId, body);
    if (result === 'not_found') return res.status(404).json({ error: 'Stage not found' });
    res.json(result);
  },
);

// PUT /api/events/:slug/transitions/after-group/:groupId
router.put(
  '/after-group/:groupId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'Invalid groupId' });
    }

    const body = validateUpsertBody(req.body as Partial<UpsertTransitionBody>, res);
    if (!body) return;

    const result = await upsertTransitionAfterGroup(ctx.eventId, groupId, body);
    if (result === 'not_found') return res.status(404).json({ error: 'Group not found' });
    res.json(result);
  },
);

// DELETE /api/events/:slug/transitions/:id
router.delete('/:id', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const deleted = await deleteStageTransition(ctx.eventId, id);
  if (!deleted) return res.status(404).json({ error: 'Transition not found' });
  res.status(204).send();
});

export default router;
