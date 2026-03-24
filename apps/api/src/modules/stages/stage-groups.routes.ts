import { Router, type Response } from 'express';
import {
  authOptional,
  authRequired,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  listStageGroups,
  getStageGroup,
  createStageGroup,
  updateStageGroup,
  reorderStageGroup,
  deleteStageGroup,
  scaffoldGroupStages,
} from './stage-groups.service';
import { getGroupLeaderboard } from '../leaderboards/leaderboards.service';
import type { CreateGroupBody, UpdateGroupBody } from './stage-groups.service';

// Mounted at /api/events/:slug/stage-groups via events.routes.ts (mergeParams: true)
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

// GET /api/events/:slug/stage-groups — list groups (admin only)
router.get('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;
  const groups = await listStageGroups(ctx.eventId);
  res.json(groups);
});

// GET /api/events/:slug/stage-groups/:groupId — single group (admin only)
router.get('/:groupId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'Invalid groupId' });
  }

  const group = await getStageGroup(ctx.eventId, groupId);
  if (!group) return res.status(404).json({ error: 'Stage group not found' });
  res.json(group);
});

// GET /api/events/:slug/stage-groups/:groupId/leaderboard — group leaderboard (public)
router.get(
  '/:groupId/leaderboard',
  authOptional,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const groupId = Number(req.params.groupId);

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'Invalid groupId' });
    }

    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
    const event = await getEventBySlug(slug, isAdmin);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Verify the group belongs to this event
    const group = await getStageGroup(event.id, groupId);
    if (!group) return res.status(404).json({ error: 'Stage group not found' });

    const leaderboard = await getGroupLeaderboard(groupId);
    if (!leaderboard) return res.status(404).json({ error: 'Stage group not found' });
    res.json(leaderboard);
  },
);

// POST /api/events/:slug/stage-groups — create group (admin)
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const body = req.body as CreateGroupBody;
  if (!body.label || typeof body.label !== 'string') {
    return res.status(400).json({ error: 'label is required' });
  }

  const group = await createStageGroup(ctx.eventId, body);
  res.status(201).json(group);
});

// PUT /api/events/:slug/stage-groups/:groupId — update group (admin)
router.put('/:groupId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'Invalid groupId' });
  }

  const body = req.body as UpdateGroupBody;
  const group = await updateStageGroup(ctx.eventId, groupId, body);
  if (!group) return res.status(404).json({ error: 'Stage group not found' });
  res.json(group);
});

// PATCH /api/events/:slug/stage-groups/:groupId/reorder — update group_index (admin)
router.patch(
  '/:groupId/reorder',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'Invalid groupId' });
    }

    const newIndex = Number(req.body?.new_index);
    if (!Number.isInteger(newIndex) || newIndex < 0) {
      return res.status(400).json({ error: 'new_index must be a non-negative integer' });
    }

    const group = await reorderStageGroup(ctx.eventId, groupId, newIndex);
    if (!group) return res.status(404).json({ error: 'Stage group not found' });
    res.json(group);
  },
);

// DELETE /api/events/:slug/stage-groups/:groupId — delete group (admin; blocked if has stages)
router.delete('/:groupId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const groupId = Number(req.params.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    return res.status(400).json({ error: 'Invalid groupId' });
  }

  const result = await deleteStageGroup(ctx.eventId, groupId);
  if (result === 'has_stages') {
    return res
      .status(409)
      .json({ error: 'Cannot delete a group that still has stages — ungroup all stages first' });
  }
  if (!result) return res.status(404).json({ error: 'Stage group not found' });
  res.status(204).send();
});

// POST /api/events/:slug/stage-groups/:groupId/scaffold — bulk-create stages from template (admin)
router.post(
  '/:groupId/scaffold',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: 'Invalid groupId' });
    }

    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      return res.status(400).json({ error: 'count must be an integer between 1 and 50' });
    }

    const firstStartsAt: string | null = req.body?.first_starts_at ?? null;
    const stageDurationDays: number | null = req.body?.stage_duration_days
      ? Number(req.body.stage_duration_days)
      : null;

    if (
      stageDurationDays !== null &&
      (!Number.isInteger(stageDurationDays) || stageDurationDays < 1)
    ) {
      return res.status(400).json({ error: 'stage_duration_days must be a positive integer' });
    }

    try {
      const stages = await scaffoldGroupStages(
        ctx.eventId,
        groupId,
        count,
        firstStartsAt,
        stageDurationDays,
      );
      res.status(201).json(stages);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scaffold failed';
      if (message.includes('not found')) return res.status(404).json({ error: message });
      return res.status(400).json({ error: message });
    }
  },
);

export default router;
