import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from './stages.service';
import { getGameSlot } from './games.service';
import { submitResult, listResultsForGame } from '../results/results.service';
import {
  runReplayValidation,
  type ReplayValidationError,
} from '../replay/replay-validation.service';
import { pool } from '../../config/db';

// Mounted at /api/events/:slug/stages/:stageId/games/:gameId (mergeParams: true)
// Routes:
//   POST /results  — submit a result
//   GET  /results  — list results for this game
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper — resolves full context including game and event metadata
// ---------------------------------------------------------------------------

async function resolveContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{
  eventId: number;
  stageId: number;
  gameId: number;
  stageGameTeamSize: number | null;
  stageGameMaxScore: number | null;
  stageGameVariantId: number | null;
  stageGameSeedPayload: string | null;
  enforceExactTeamMatch: boolean;
  isAdmin: boolean;
  eventMeta: {
    registration_mode: string;
    registration_cutoff: Date | null;
    allow_late_registration: boolean;
  };
} | null> {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  const gameId = Number(req.params.gameId);

  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
    return null;
  }
  if (!Number.isInteger(gameId) || gameId <= 0) {
    res.status(400).json({ error: 'Invalid gameId' });
    return null;
  }

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isGlobalAdmin = req.user!.role === 'ADMIN' || req.user!.role === 'SUPERADMIN';
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

  const game = await getGameSlot(stageId, gameId);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }

  const isSuperadmin = req.user!.role === 'SUPERADMIN';
  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  const isAdmin = role !== null;

  const enforceExactTeamMatch =
    typeof stage.config_json?.enforce_exact_team_size === 'boolean'
      ? stage.config_json.enforce_exact_team_size
      : false;

  return {
    eventId: event.id,
    stageId,
    gameId,
    stageGameTeamSize: game.team_size ?? null,
    stageGameMaxScore: game.max_score ?? null,
    stageGameVariantId: game.variant_id ?? null,
    stageGameSeedPayload: game.seed_payload ?? null,
    enforceExactTeamMatch,
    isAdmin,
    eventMeta: {
      registration_mode: event.registration_mode,
      registration_cutoff: event.registration_cutoff,
      allow_late_registration: event.allow_late_registration,
    },
  };
}

// POST /api/events/:slug/stages/:stageId/games/:gameId/results
router.post('/results', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const body = req.body ?? {};

  if (body.team_id === undefined || !Number.isInteger(Number(body.team_id))) {
    return res.status(400).json({ error: 'team_id is required' });
  }
  if (body.score === undefined || typeof body.score !== 'number') {
    return res.status(400).json({ error: 'score is required and must be a number' });
  }
  if (body.score < 0) {
    return res.status(400).json({ error: 'score must be >= 0' });
  }

  const teamId = Number(body.team_id);
  let score: number = body.score;
  let startedAt: string | null = null;
  let playedAt: string | null = body.played_at ?? null;
  const hanabiLiveGameId: number | null = body.hanabi_live_game_id
    ? Number(body.hanabi_live_game_id)
    : null;

  if (hanabiLiveGameId !== null) {
    // Fetch confirmed team member display names for player pool validation
    const membersResult = await pool.query<{ display_name: string }>(
      `SELECT u.display_name
       FROM event_team_members etm
       JOIN users u ON u.id = etm.user_id
       WHERE etm.event_team_id = $1 AND etm.confirmed = TRUE`,
      [teamId],
    );
    const teamPlayerPool = membersResult.rows.map((r) => r.display_name);

    const validation = await runReplayValidation({
      gameId: hanabiLiveGameId,
      teamPlayerPool,
      enforceExactTeamMatch: ctx.enforceExactTeamMatch,
      variantId: ctx.stageGameVariantId,
      seedPayload: ctx.stageGameSeedPayload,
    });

    if (!validation.ok) {
      const err = validation as ReplayValidationError;
      return res.status(err.status).json({ error: err.message });
    }

    // Override with authoritative values from hanab.live
    if (validation.derived.score !== null) {
      score = validation.derived.score;
    }
    startedAt = validation.derived.startedAt;
    playedAt = validation.derived.playedAt;
  }

  const result = await submitResult(
    {
      eventId: ctx.eventId,
      stageGameId: ctx.gameId,
      stageGameTeamSize: ctx.stageGameTeamSize,
      stageGameMaxScore: ctx.stageGameMaxScore,
      submitterUserId: req.user!.userId,
      isAdmin: ctx.isAdmin,
      eventMeta: ctx.eventMeta,
    },
    {
      teamId,
      score,
      zeroReason: body.zero_reason ?? null,
      bottomDeckRisk: body.bottom_deck_risk ?? null,
      hanabiLiveGameId,
      startedAt,
      playedAt,
      attemptId: body.attempt_id ?? null,
    },
  );

  if (result.ok === false) {
    const reason = (result as { ok: false; reason: string }).reason;
    if (reason === 'team_not_found') return res.status(404).json({ error: 'Team not found' });
    if (reason === 'not_on_team')
      return res.status(403).json({ error: 'You are not a member of this team' });
    if (reason === 'team_size_mismatch')
      return res.status(409).json({ error: 'Team size does not match this game slot' });
    if (reason === 'score_too_high')
      return res.status(400).json({ error: `Score exceeds max_score of ${ctx.stageGameMaxScore}` });
    if (reason === 'zero_needs_reason')
      return res.status(400).json({ error: 'zero_reason is required when score is 0' });
    if (reason === 'registration_cutoff')
      return res.status(409).json({ error: 'Registration cutoff has passed' });
    if (reason === 'out_of_order')
      return res
        .status(409)
        .json({ error: 'Previous games in this attempt must be submitted first' });
    return res.status(409).json({ error: 'A result already exists for this team and game' });
  }

  res.status(201).json((result as { ok: true; result: unknown }).result);
});

// GET /api/events/:slug/stages/:stageId/games/:gameId/results
router.get('/results', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveContext(req, res);
  if (!ctx) return;

  const userId = ctx.isAdmin ? undefined : req.user!.userId;
  const results = await listResultsForGame(ctx.gameId, userId);
  res.json(results);
});

export default router;
