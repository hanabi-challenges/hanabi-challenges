import { Router, type Response } from 'express';
import {
  authRequired,
  authOptional,
  type AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import {
  listMatches,
  getMatchDetail,
  updateMatchStatus,
  submitMatchGameResult,
  setMatchWinner,
  setMatchGameVariantSeed,
  type MatchStatus,
} from './matches.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   GET  /matches                      — list matches
//   GET  /matches/:matchId             — match detail
//   PUT  /matches/:matchId/status      — admin: update status
//   POST /matches/:matchId/results     — submit game result
//   PATCH /matches/:matchId/winner     — admin: set winner
const router = Router({ mergeParams: true });

const VALID_STATUSES: MatchStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETE'];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
  requireAuth: boolean,
): Promise<{
  eventId: number;
  stageId: number;
  isAdmin: boolean;
  userId: number | undefined;
} | null> {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);

  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
    return null;
  }

  const userId = req.user?.userId;
  if (requireAuth && !userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isGlobalAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isGlobalAdmin);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const role = userId
    ? isSuperadmin
      ? 'SUPERADMIN'
      : await getEventAdminRole(event.id, userId)
    : null;
  const isAdmin = role !== null;

  return { eventId: event.id, stageId, isAdmin, userId };
}

// GET /api/events/:slug/stages/:stageId/matches
router.get('/matches', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res, false);
  if (!ctx) return;

  const matches = await listMatches(ctx.stageId);
  res.json(matches);
});

// GET /api/events/:slug/stages/:stageId/matches/:matchId
router.get('/matches/:matchId', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res, false);
  if (!ctx) return;

  const matchId = Number(req.params.matchId);
  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  const match = await getMatchDetail(matchId, ctx.stageId);
  if (!match) return res.status(404).json({ error: 'Match not found' });
  res.json(match);
});

// PUT /api/events/:slug/stages/:stageId/matches/:matchId/status — admin only
router.put(
  '/matches/:matchId/status',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res, true);
    if (!ctx) return;

    if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ error: 'Invalid matchId' });
    }

    const { status } = req.body ?? {};
    if (!VALID_STATUSES.includes(status as MatchStatus)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const result = await updateMatchStatus(matchId, ctx.stageId, status as MatchStatus);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_found') return res.status(404).json({ error: 'Match not found' });
      return res.status(409).json({ error: 'Invalid status transition' });
    }

    res.json((result as { ok: true; match: unknown }).match);
  },
);

// POST /api/events/:slug/stages/:stageId/matches/:matchId/results
router.post(
  '/matches/:matchId/results',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res, true);
    if (!ctx) return;

    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ error: 'Invalid matchId' });
    }

    const body = req.body ?? {};

    const gameIndex = Number(body.game_index);
    if (!Number.isInteger(gameIndex) || gameIndex <= 0) {
      return res.status(400).json({ error: 'game_index must be a positive integer' });
    }
    if (typeof body.team1_score !== 'number' || body.team1_score < 0) {
      return res.status(400).json({ error: 'team1_score must be a non-negative number' });
    }
    if (typeof body.team2_score !== 'number' || body.team2_score < 0) {
      return res.status(400).json({ error: 'team2_score must be a non-negative number' });
    }

    const result = await submitMatchGameResult(matchId, ctx.stageId, {
      gameIndex,
      team1Score: body.team1_score,
      team2Score: body.team2_score,
      variantId: body.variant_id ?? null,
      seedPayload: body.seed_payload ?? null,
    });

    if (result.ok === false) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.status(201).json((result as { ok: true; match: unknown }).match);
  },
);

// PATCH /api/events/:slug/stages/:stageId/matches/:matchId/winner — admin only
router.patch(
  '/matches/:matchId/winner',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res, true);
    if (!ctx) return;

    if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ error: 'Invalid matchId' });
    }

    // winner_team_id can be a number or null to clear
    const winnerTeamId =
      req.body?.winner_team_id === null || req.body?.winner_team_id === undefined
        ? null
        : Number(req.body.winner_team_id);

    if (winnerTeamId !== null && (!Number.isInteger(winnerTeamId) || winnerTeamId <= 0)) {
      return res.status(400).json({ error: 'Invalid winner_team_id' });
    }

    const result = await setMatchWinner(matchId, ctx.stageId, winnerTeamId);

    if (result.ok === false) {
      const reason = (result as { ok: false; reason: string }).reason;
      if (reason === 'not_found') return res.status(404).json({ error: 'Match not found' });
      return res.status(400).json({ error: 'winner_team_id must be one of the match teams' });
    }

    res.json((result as { ok: true; match: unknown }).match);
  },
);

// PATCH /api/events/:slug/stages/:stageId/matches/:matchId/games/:gameIndex — admin: set variant/seed
router.patch(
  '/matches/:matchId/games/:gameIndex',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveContext(req, res, true);
    if (!ctx) return;

    if (!ctx.isAdmin) return res.status(403).json({ error: 'Forbidden' });

    const matchId = Number(req.params.matchId);
    if (!Number.isInteger(matchId) || matchId <= 0) {
      return res.status(400).json({ error: 'Invalid matchId' });
    }

    const gameIndex = Number(req.params.gameIndex);
    if (!Number.isInteger(gameIndex) || gameIndex <= 0) {
      return res.status(400).json({ error: 'Invalid gameIndex' });
    }

    const variantId =
      req.body?.variant_id === null || req.body?.variant_id === undefined
        ? null
        : Number(req.body.variant_id);

    if (variantId !== null && (!Number.isInteger(variantId) || variantId < 0)) {
      return res.status(400).json({ error: 'Invalid variant_id' });
    }

    const seedPayload =
      req.body?.seed_payload === undefined ? undefined : (req.body.seed_payload as string | null);

    const result = await setMatchGameVariantSeed(
      matchId,
      ctx.stageId,
      gameIndex,
      variantId,
      seedPayload ?? null,
    );

    if (!result.ok) return res.status(404).json({ error: 'Match not found' });

    res.json(result.game);
  },
);

export default router;
