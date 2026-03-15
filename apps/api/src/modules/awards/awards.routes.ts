import { Router, type Response } from 'express';
import {
  authOptional,
  authRequired,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listAwards,
  getAward,
  createAward,
  updateAward,
  deleteAward,
  reorderAwards,
  validateCriteriaValue,
  type CreateAwardBody,
  type UpdateAwardBody,
  type CriteriaType,
} from './awards.service';
import {
  evaluateAwards,
  listGrantsForAward,
  listMyGrants,
  createManualGrant,
  revokeGrant,
} from './awards-evaluation.service';

const VALID_CRITERIA_TYPES: CriteriaType[] = [
  'RANK_POSITION',
  'SCORE_THRESHOLD',
  'PARTICIPATION',
  'MANUAL',
];
const VALID_ATTRIBUTIONS = ['INDIVIDUAL', 'TEAM'] as const;

// Mounted at /api/events/:slug/awards (mergeParams: true)
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

// ---------------------------------------------------------------------------
// GET /api/events/:slug/awards
// ---------------------------------------------------------------------------

router.get('/', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const awards = await listAwards(event.id);
  res.json(awards);
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards — create award (admin)
// ---------------------------------------------------------------------------

router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const body = req.body as CreateAwardBody;

  if (!body.name || typeof body.name !== 'string') {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!VALID_CRITERIA_TYPES.includes(body.criteria_type as CriteriaType)) {
    return res
      .status(400)
      .json({ error: `criteria_type must be one of: ${VALID_CRITERIA_TYPES.join(', ')}` });
  }
  if (
    body.attribution !== undefined &&
    !VALID_ATTRIBUTIONS.includes(body.attribution as (typeof VALID_ATTRIBUTIONS)[number])
  ) {
    return res
      .status(400)
      .json({ error: `attribution must be one of: ${VALID_ATTRIBUTIONS.join(', ')}` });
  }

  const validationError = validateCriteriaValue(
    body.criteria_type as CriteriaType,
    body.criteria_value,
  );
  if (validationError) return res.status(400).json({ error: validationError });

  const result = await createAward(ctx.eventId, body);
  if (result.ok) return res.status(201).json(result.award);
  const reason = (result as { ok: false; reason: string }).reason;
  if (reason === 'stage_not_in_event') {
    return res.status(400).json({ error: 'stage_id does not belong to this event' });
  }
  return res.status(400).json({ error: reason });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/awards/reorder — bulk reorder (admin)
// MUST be before /:awardId to avoid treating "reorder" as an ID
// ---------------------------------------------------------------------------

router.patch('/reorder', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const entries = req.body?.entries;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: 'entries must be an array' });
  }
  for (const e of entries) {
    if (typeof e.award_id !== 'number' || typeof e.sort_order !== 'number') {
      return res
        .status(400)
        .json({ error: 'each entry must have award_id and sort_order (numbers)' });
    }
  }

  const result = await reorderAwards(ctx.eventId, entries);
  if (!result.ok) {
    return res.status(400).json({ error: 'One or more award_ids do not belong to this event' });
  }
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/awards/:awardId — update award (admin)
// ---------------------------------------------------------------------------

router.put('/:awardId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const awardId = Number(req.params.awardId);
  if (!Number.isInteger(awardId) || awardId <= 0) {
    return res.status(400).json({ error: 'Invalid awardId' });
  }

  const body = req.body as UpdateAwardBody;

  if (
    body.criteria_type !== undefined &&
    !VALID_CRITERIA_TYPES.includes(body.criteria_type as CriteriaType)
  ) {
    return res
      .status(400)
      .json({ error: `criteria_type must be one of: ${VALID_CRITERIA_TYPES.join(', ')}` });
  }
  if (
    body.attribution !== undefined &&
    !VALID_ATTRIBUTIONS.includes(body.attribution as (typeof VALID_ATTRIBUTIONS)[number])
  ) {
    return res
      .status(400)
      .json({ error: `attribution must be one of: ${VALID_ATTRIBUTIONS.join(', ')}` });
  }

  if (body.criteria_type !== undefined || body.criteria_value !== undefined) {
    const existing = await getAward(awardId, ctx.eventId);
    if (!existing) return res.status(404).json({ error: 'Award not found' });
    const effectiveType = (body.criteria_type ?? existing.criteria_type) as CriteriaType;
    const effectiveValue =
      body.criteria_value !== undefined ? body.criteria_value : existing.criteria_value;
    const validationError = validateCriteriaValue(effectiveType, effectiveValue);
    if (validationError) return res.status(400).json({ error: validationError });
  }

  const result = await updateAward(awardId, ctx.eventId, body);
  if (!result.ok) return res.status(404).json({ error: 'Award not found' });
  res.json(result.award);
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/awards/:awardId — delete award (admin)
// ---------------------------------------------------------------------------

router.delete('/:awardId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const awardId = Number(req.params.awardId);
  if (!Number.isInteger(awardId) || awardId <= 0) {
    return res.status(400).json({ error: 'Invalid awardId' });
  }

  const result = await deleteAward(awardId, ctx.eventId);
  if (result === 'not_found') return res.status(404).json({ error: 'Award not found' });
  if (result === 'has_grants')
    return res.status(409).json({ error: 'Cannot delete an award that has grants' });
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards/evaluate — run evaluation engine (admin)
// MUST be before /:awardId to avoid treating "evaluate" as an ID
// ---------------------------------------------------------------------------

router.post('/evaluate', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const stageIdParam = req.body?.stage_id;
  const stageId = stageIdParam != null ? Number(stageIdParam) : undefined;
  if (stageId !== undefined && (!Number.isInteger(stageId) || stageId <= 0)) {
    return res.status(400).json({ error: 'Invalid stage_id' });
  }

  const newGrants = await evaluateAwards(ctx.eventId, stageId);
  res.json({ grants_created: newGrants.length, grants: newGrants });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/grants/me — current user's grants for this event
// ---------------------------------------------------------------------------

router.get('/me/grants', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const grants = await listMyGrants(event.id, req.user!.userId);
  res.json(grants);
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/awards/:awardId/grants — list grants for an award
// ---------------------------------------------------------------------------

router.get('/:awardId/grants', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const awardId = Number(req.params.awardId);
  if (!Number.isInteger(awardId) || awardId <= 0) {
    return res.status(400).json({ error: 'Invalid awardId' });
  }

  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const award = await getAward(awardId, event.id);
  if (!award) return res.status(404).json({ error: 'Award not found' });

  const grants = await listGrantsForAward(awardId);
  res.json(grants);
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards/:awardId/grants — manual grant (admin, MANUAL only)
// ---------------------------------------------------------------------------

router.post('/:awardId/grants', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const awardId = Number(req.params.awardId);
  if (!Number.isInteger(awardId) || awardId <= 0) {
    return res.status(400).json({ error: 'Invalid awardId' });
  }

  const award = await getAward(awardId, ctx.eventId);
  if (!award) return res.status(404).json({ error: 'Award not found' });
  if (award.criteria_type !== 'MANUAL') {
    return res.status(400).json({ error: 'Manual grants only allowed for MANUAL criteria awards' });
  }

  const userId = Number(req.body?.user_id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const teamIdParam = req.body?.event_team_id;
  const teamId = teamIdParam != null ? Number(teamIdParam) : null;

  const grant = await createManualGrant(awardId, userId, teamId);
  if (!grant) return res.status(409).json({ error: 'Grant already exists for this user' });
  res.status(201).json(grant);
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/awards/:awardId/grants/:grantId — revoke grant (admin)
// ---------------------------------------------------------------------------

router.delete(
  '/:awardId/grants/:grantId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const awardId = Number(req.params.awardId);
    const grantId = Number(req.params.grantId);
    if (!Number.isInteger(awardId) || awardId <= 0 || !Number.isInteger(grantId) || grantId <= 0) {
      return res.status(400).json({ error: 'Invalid awardId or grantId' });
    }

    const award = await getAward(awardId, ctx.eventId);
    if (!award) return res.status(404).json({ error: 'Award not found' });

    const deleted = await revokeGrant(grantId);
    if (!deleted) return res.status(404).json({ error: 'Grant not found' });
    res.status(204).send();
  },
);

export default router;
