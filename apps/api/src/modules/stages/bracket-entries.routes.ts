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
  listBracketEntries,
  addBracketEntry,
  deleteBracketEntry,
  qualifyBracketEntries,
} from './bracket-entries.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Permission helper
// ---------------------------------------------------------------------------

async function resolveEventAndAdminCheck(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; stageId: number } | null> {
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

  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  if (!isSuperadmin) {
    const role = await getEventAdminRole(event.id, userId);
    if (!role) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
  }

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  return { eventId: event.id, stageId };
}

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/entries
// ---------------------------------------------------------------------------

router.get('/entries', authOptional, async (req: AuthenticatedRequest, res: Response) => {
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

  const entries = await listBracketEntries(stageId);
  res.json(entries);
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/entries/qualify — BEFORE /:entryId
// ---------------------------------------------------------------------------

router.post('/entries/qualify', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const sourceStageId =
    req.body?.source_stage_id != null ? Number(req.body.source_stage_id) : undefined;
  const sourceGroupId =
    req.body?.source_group_id != null ? Number(req.body.source_group_id) : undefined;

  const result = await qualifyBracketEntries(
    ctx.stageId,
    ctx.eventId,
    sourceStageId,
    sourceGroupId,
  );

  if (result.ok) return res.status(201).json(result);
  const reason1 = (result as { ok: false; reason: string }).reason;
  if (reason1 === 'no_transition') {
    return res.status(400).json({ error: 'No stage transition found for this stage' });
  }
  if (reason1 === 'already_has_entries') {
    return res.status(409).json({ error: 'Stage already has bracket entries' });
  }
  return res.status(400).json({ error: reason1 });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/entries — manually add team
// ---------------------------------------------------------------------------

router.post('/entries', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndAdminCheck(req, res);
  if (!ctx) return;

  const teamId = Number(req.body?.team_id);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'team_id is required' });
  }

  const seed = req.body?.seed != null ? Number(req.body.seed) : null;

  const result = await addBracketEntry(ctx.stageId, ctx.eventId, teamId, seed);
  if (result.ok) return res.status(201).json(result.entry);
  const reason2 = (result as { ok: false; reason: string }).reason;
  if (reason2 === 'team_not_in_event') {
    return res.status(400).json({ error: 'Team does not belong to this event' });
  }
  if (reason2 === 'already_enrolled') {
    return res.status(409).json({ error: 'Team is already enrolled in this bracket' });
  }
  return res.status(400).json({ error: reason2 });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stages/:stageId/entries/:entryId
// ---------------------------------------------------------------------------

router.delete(
  '/entries/:entryId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventAndAdminCheck(req, res);
    if (!ctx) return;

    const entryId = Number(req.params.entryId);
    if (!Number.isInteger(entryId) || entryId <= 0) {
      return res.status(400).json({ error: 'Invalid entryId' });
    }

    const result = await deleteBracketEntry(ctx.stageId, entryId);
    if (result === 'not_found') return res.status(404).json({ error: 'Entry not found' });
    if (result === 'has_matches') {
      return res.status(409).json({ error: 'Cannot remove a team that already has matches' });
    }
    res.status(204).send();
  },
);

export default router;
