import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { updateResult, deleteResult } from './results.service';

// Mounted at /api/events/:slug/results (mergeParams: true)
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper — admin-only context
// ---------------------------------------------------------------------------

async function resolveAdminContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number } | null> {
  const slug = String(req.params.slug);
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isSuperadmin = req.user!.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { eventId: event.id };
}

const VALID_ZERO_REASONS = ['Strike Out', 'Time Out', 'VTK'];

// PUT /api/events/:slug/results/:resultId
router.put('/:resultId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  const resultId = Number(req.params.resultId);
  if (!Number.isInteger(resultId) || resultId <= 0) {
    return res.status(400).json({ error: 'Invalid resultId' });
  }

  const body = req.body ?? {};

  // Validate score if provided
  if (body.score !== undefined) {
    if (typeof body.score !== 'number' || body.score < 0) {
      return res.status(400).json({ error: 'score must be a non-negative number' });
    }
  }

  // Validate zero_reason if provided
  if (body.zero_reason !== undefined && body.zero_reason !== null) {
    if (!VALID_ZERO_REASONS.includes(body.zero_reason)) {
      return res
        .status(400)
        .json({ error: `zero_reason must be one of: ${VALID_ZERO_REASONS.join(', ')}` });
    }
  }

  const result = await updateResult(resultId, ctx.eventId, {
    score: body.score,
    zeroReason: body.zero_reason,
    bottomDeckRisk: body.bottom_deck_risk,
    hanabiLiveGameId: body.hanabi_live_game_id,
    playedAt: body.played_at ?? null,
    correctedBy: req.user!.userId,
  });

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'not_found') return res.status(404).json({ error: 'Result not found' });
    if (reason === 'zero_needs_reason')
      return res.status(400).json({ error: 'zero_reason is required when score is 0' });
    return res.status(400).json({ error: 'Score exceeds max_score for this game' });
  }

  res.json((result as { ok: true; result: unknown }).result);
});

// DELETE /api/events/:slug/results/:resultId
router.delete('/:resultId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  const resultId = Number(req.params.resultId);
  if (!Number.isInteger(resultId) || resultId <= 0) {
    return res.status(400).json({ error: 'Invalid resultId' });
  }

  const result = await deleteResult(resultId, ctx.eventId);

  if (result.ok === false) {
    return res.status(404).json({ error: 'Result not found' });
  }

  res.status(204).send();
});

export default router;
