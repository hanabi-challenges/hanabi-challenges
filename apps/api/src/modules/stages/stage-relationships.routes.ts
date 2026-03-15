import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listStageRelationships,
  createStageRelationship,
  updateStageRelationship,
  deleteStageRelationship,
  type CreateRelationshipBody,
  type UpdateRelationshipBody,
} from './stage-relationships.service';

const VALID_FILTER_TYPES = ['ALL', 'TOP_N', 'THRESHOLD', 'MANUAL'] as const;
const VALID_SEEDING_METHODS = ['RANKED', 'RANDOM', 'MANUAL'] as const;

// Mounted at /api/events/:slug/stage-relationships via events.routes.ts (mergeParams: true)
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Permission helper
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

// GET /api/events/:slug/stage-relationships
router.get('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;
  const relationships = await listStageRelationships(ctx.eventId);
  res.json(relationships);
});

// POST /api/events/:slug/stage-relationships
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const body = req.body as CreateRelationshipBody;

  const sourceId = Number(body.source_stage_id);
  const targetId = Number(body.target_stage_id);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    return res.status(400).json({ error: 'source_stage_id is required' });
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'target_stage_id is required' });
  }
  if (sourceId === targetId) {
    return res.status(400).json({ error: 'source_stage_id and target_stage_id must differ' });
  }
  if (!VALID_FILTER_TYPES.includes(body.filter_type as (typeof VALID_FILTER_TYPES)[number])) {
    return res
      .status(400)
      .json({ error: `filter_type must be one of: ${VALID_FILTER_TYPES.join(', ')}` });
  }
  if (
    (body.filter_type === 'TOP_N' || body.filter_type === 'THRESHOLD') &&
    (body.filter_value == null || isNaN(Number(body.filter_value)))
  ) {
    return res
      .status(400)
      .json({ error: 'filter_value is required for TOP_N and THRESHOLD filter types' });
  }
  if (
    body.seeding_method !== undefined &&
    !VALID_SEEDING_METHODS.includes(body.seeding_method as (typeof VALID_SEEDING_METHODS)[number])
  ) {
    return res
      .status(400)
      .json({ error: `seeding_method must be one of: ${VALID_SEEDING_METHODS.join(', ')}` });
  }

  const result = await createStageRelationship(ctx.eventId, {
    source_stage_id: sourceId,
    target_stage_id: targetId,
    filter_type: body.filter_type,
    filter_value: body.filter_value ?? null,
    seeding_method: body.seeding_method,
  });

  if (result === 'cross_event') {
    return res.status(400).json({ error: 'Both stages must belong to the same event' });
  }
  if (result === 'duplicate') {
    return res.status(409).json({ error: 'A relationship between these stages already exists' });
  }

  res.status(201).json(result);
});

// PUT /api/events/:slug/stage-relationships/:id
router.put('/:id', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const body = req.body as UpdateRelationshipBody;

  if (
    body.filter_type !== undefined &&
    !VALID_FILTER_TYPES.includes(body.filter_type as (typeof VALID_FILTER_TYPES)[number])
  ) {
    return res
      .status(400)
      .json({ error: `filter_type must be one of: ${VALID_FILTER_TYPES.join(', ')}` });
  }
  if (
    body.seeding_method !== undefined &&
    !VALID_SEEDING_METHODS.includes(body.seeding_method as (typeof VALID_SEEDING_METHODS)[number])
  ) {
    return res
      .status(400)
      .json({ error: `seeding_method must be one of: ${VALID_SEEDING_METHODS.join(', ')}` });
  }

  // If filter_type requires a value but filter_value isn't provided, reject
  const effectiveFilterType = body.filter_type;
  if (
    (effectiveFilterType === 'TOP_N' || effectiveFilterType === 'THRESHOLD') &&
    !Object.prototype.hasOwnProperty.call(body, 'filter_value')
  ) {
    return res
      .status(400)
      .json({ error: 'filter_value is required for TOP_N and THRESHOLD filter types' });
  }

  const updated = await updateStageRelationship(ctx.eventId, id, body);
  if (!updated) return res.status(404).json({ error: 'Stage relationship not found' });
  res.json(updated);
});

// DELETE /api/events/:slug/stage-relationships/:id
router.delete('/:id', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const deleted = await deleteStageRelationship(ctx.eventId, id);
  if (!deleted) return res.status(404).json({ error: 'Stage relationship not found' });
  res.status(204).send();
});

export default router;
