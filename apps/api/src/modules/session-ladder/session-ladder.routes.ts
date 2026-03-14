import { Router, Request, Response } from 'express';
import { authOptional, authRequired, AuthenticatedRequest } from '../../middleware/authMiddleware';
import {
  addEventDelegate,
  assignNextRound,
  canManageEvent,
  canSubmitTeamScore,
  closeSessionOrDeleteIfEmpty,
  closeEventAndComplete,
  createSession,
  createSessionRound,
  finalizeRoundElo,
  getRoundTeamReplayValidationContext,
  finalizeReadyCheckAndAssignNextRound,
  generateSessions,
  getRoundEventId,
  getSessionEventInfo,
  getSessionLadderConfig,
  getSessionLadderEventBySlug,
  getSessionState,
  listDelegatesWithOwner,
  listRatingHistory,
  listSessionEloForEvent,
  listSessionPlacementsForEvent,
  listSessionsForEvent,
  listStandings,
  removeEventDelegate,
  reorderSessionRounds,
  setSessionPresence,
  setSessionStatus,
  startReadyCheckForNextRound,
  submitReadyCheckResponse,
  submitRoundScore,
  upsertSessionLadderConfig,
} from './session-ladder.service';
import { hasConcededEventSpoilers } from '../events/spoiler-concession.service';
import {
  encodeRoundSeedPayload,
  fetchJsonWithTimeout,
  parseGameId,
  parseSeedPayload,
} from './session-ladder.utils';
import { getVariantCodeByName } from '../variants/variants.service';
import {
  extractReplayExportPlayers,
  extractReplayHistoryGames,
  normalizeReplayEndCondition,
} from '../replay/replay-parse';

const router = Router();

type ReplayHistoryGame = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  variantName?: string | null;
  variant?: string | null;
  options?: {
    variantName?: string | null;
    variantID?: number | null;
    variant?: string | null;
  } | null;
  score?: number | string | null;
  endCondition?: number | null;
  datetimeStarted?: string | null;
  datetimeFinished?: string | null;
  datetimeFinishedUtc?: string | null;
  datetime_finished?: string | null;
};

async function requireSessionLadderEvent(slug: string, res: Response) {
  const event = await getSessionLadderEventBySlug(slug);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }
  if (event.event_format !== 'session_ladder') {
    res.status(400).json({ error: 'This endpoint requires event_format=session_ladder' });
    return null;
  }
  return event;
}

async function requireManagerForEvent(
  req: AuthenticatedRequest,
  res: Response,
  eventId: number,
): Promise<boolean> {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  const allowed = await canManageEvent({
    eventId,
    userId: req.user.userId,
    userRole: req.user.role,
  });
  if (!allowed) {
    res.status(403).json({ error: 'Manager access required for this event' });
    return false;
  }
  return true;
}

router.get(
  '/events/:slug/access',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    const canManage = await canManageEvent({
      eventId: event.id,
      userId: req.user!.userId,
      userRole: req.user!.role,
    });
    const delegates = canManage ? await listDelegatesWithOwner(event.id) : null;
    res.json({
      event_id: event.id,
      owner_user_id: delegates?.owner_user_id ?? event.owner_user_id ?? null,
      can_manage: canManage,
      delegates: delegates?.delegates ?? [],
    });
  },
);

router.get(
  '/events/:slug/delegates',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const data = await listDelegatesWithOwner(event.id);
    res.json(data);
  },
);

router.post(
  '/events/:slug/delegates',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const userId = Number(req.body?.user_id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'user_id must be a positive integer' });
    }

    await addEventDelegate(event.id, userId);
    res.status(204).send();
  },
);

router.delete(
  '/events/:slug/delegates/:userId',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const userId = Number(req.params.userId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid userId' });
    }
    await removeEventDelegate(event.id, userId);
    res.status(204).send();
  },
);

router.post(
  '/events/:slug/config',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const {
      team_size_mode = 'hybrid_3_4',
      team_size = null,
      k_factor = 24,
      participation_bonus = 0.5,
      rounds_per_session = 1,
      random_seed_salt = null,
    } = req.body ?? {};

    if (team_size_mode !== 'fixed' && team_size_mode !== 'hybrid_3_4') {
      return res.status(400).json({ error: 'team_size_mode must be "fixed" or "hybrid_3_4"' });
    }
    const teamSizeNum = team_size == null ? null : Number(team_size);
    if (
      teamSizeNum != null &&
      (!Number.isInteger(teamSizeNum) || teamSizeNum < 2 || teamSizeNum > 6)
    ) {
      return res
        .status(400)
        .json({ error: 'team_size must be an integer between 2 and 6 when provided' });
    }
    const kFactorNum = Number(k_factor);
    if (!Number.isFinite(kFactorNum) || kFactorNum <= 0) {
      return res.status(400).json({ error: 'k_factor must be a positive number' });
    }
    const participationBonusNum = Number(participation_bonus);
    if (!Number.isFinite(participationBonusNum) || participationBonusNum < 0) {
      return res.status(400).json({ error: 'participation_bonus must be a non-negative number' });
    }
    const roundsPerSessionNum = Number(rounds_per_session);
    if (!Number.isInteger(roundsPerSessionNum) || roundsPerSessionNum <= 0) {
      return res.status(400).json({ error: 'rounds_per_session must be a positive integer' });
    }

    try {
      const config = await upsertSessionLadderConfig({
        eventId: event.id,
        teamSizeMode: team_size_mode,
        teamSize: teamSizeNum,
        kFactor: kFactorNum,
        participationBonus: participationBonusNum,
        roundsPerSession: roundsPerSessionNum,
        randomSeedSalt: random_seed_salt,
      });
      res.json(config);
    } catch (err) {
      console.error('Error upserting session ladder config', err);
      res.status(500).json({ error: 'Failed to save session ladder config' });
    }
  },
);

router.get('/events/:slug/config', authOptional, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;
  try {
    const config = await getSessionLadderConfig(event.id);
    res.json(config);
  } catch (err) {
    console.error('Error fetching session ladder config', err);
    res.status(500).json({ error: 'Failed to fetch session ladder config' });
  }
});

router.post(
  '/events/:slug/sessions/generate',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const {
      session_count,
      starts_at = null,
      interval_days = 7,
      clear_existing = false,
      rounds_per_session,
    } = req.body ?? {};

    const sessionCountNum = Number(session_count);
    if (!Number.isInteger(sessionCountNum) || sessionCountNum <= 0) {
      return res.status(400).json({ error: 'session_count must be a positive integer' });
    }
    if (starts_at != null) {
      const dt = new Date(starts_at);
      if (!Number.isFinite(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for starts_at' });
      }
    }
    const intervalDaysNum = Number(interval_days);
    if (!Number.isInteger(intervalDaysNum) || intervalDaysNum <= 0) {
      return res.status(400).json({ error: 'interval_days must be a positive integer' });
    }
    const existingConfig = await getSessionLadderConfig(event.id);
    const roundsPerSessionNum =
      rounds_per_session != null
        ? Number(rounds_per_session)
        : (existingConfig?.rounds_per_session ?? 1);
    if (!Number.isInteger(roundsPerSessionNum) || roundsPerSessionNum <= 0) {
      return res.status(400).json({ error: 'rounds_per_session must be a positive integer' });
    }

    try {
      const sessions = await generateSessions({
        eventId: event.id,
        sessionCount: sessionCountNum,
        roundsPerSession: roundsPerSessionNum,
        startsAt: starts_at,
        intervalDays: intervalDaysNum,
        clearExisting: Boolean(clear_existing),
      });
      res.status(201).json({ sessions });
    } catch (err) {
      console.error('Error generating sessions', err);
      res.status(500).json({ error: 'Failed to generate sessions' });
    }
  },
);

router.post(
  '/events/:slug/sessions',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const event = await requireSessionLadderEvent(slug, res);
    if (!event) return;
    if (!(await requireManagerForEvent(req, res, event.id))) return;

    const { starts_at = null, ends_at = null } = req.body ?? {};
    if (starts_at != null) {
      const dt = new Date(starts_at);
      if (!Number.isFinite(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for starts_at' });
      }
    }
    if (ends_at != null) {
      const dt = new Date(ends_at);
      if (!Number.isFinite(dt.getTime())) {
        return res.status(400).json({ error: 'Invalid date format for ends_at' });
      }
    }

    try {
      const session = await createSession({
        eventId: event.id,
        startsAt: starts_at,
        endsAt: ends_at,
      });
      res.status(201).json(session);
    } catch (err) {
      console.error('Error creating session', err);
      res.status(500).json({ error: 'Failed to create session' });
    }
  },
);

router.post('/events/:slug/end', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;
  if (!(await requireManagerForEvent(req, res, event.id))) return;
  try {
    await closeEventAndComplete(event.id);
    res.status(204).send();
  } catch (err) {
    console.error('Error ending league event', err);
    res.status(500).json({ error: 'Failed to end league event' });
  }
});

router.get('/events/:slug/sessions', authOptional, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;
  try {
    const sessions = await listSessionsForEvent(event.id);
    res.json({ sessions });
  } catch (err) {
    console.error('Error listing sessions', err);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.get('/events/:slug/standings', authOptional, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;
  try {
    const standings = await listStandings(event.id);
    res.json({ standings });
  } catch (err) {
    console.error('Error listing standings', err);
    res.status(500).json({ error: 'Failed to list standings' });
  }
});

router.get('/events/:slug/history', authOptional, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;

  const limit = Number((req.query.limit as string | undefined) ?? 300);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 2000) : 300;
  try {
    const history = await listRatingHistory(event.id, safeLimit);
    res.json({ history });
  } catch (err) {
    console.error('Error listing history', err);
    res.status(500).json({ error: 'Failed to list history' });
  }
});

router.get('/events/:slug/results-summary', authOptional, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const event = await requireSessionLadderEvent(slug, res);
  if (!event) return;

  try {
    const [sessions, standings, placements, sessionElo] = await Promise.all([
      listSessionsForEvent(event.id),
      listStandings(event.id),
      listSessionPlacementsForEvent(event.id),
      listSessionEloForEvent(event.id),
    ]);

    res.json({
      sessions,
      standings,
      placements,
      session_elo: sessionElo,
    });
  } catch (err) {
    console.error('Error building results summary', err);
    res.status(500).json({ error: 'Failed to build results summary' });
  }
});

router.get('/sessions/:sessionId/state', authRequired, async (req: Request, res: Response) => {
  const sessionId = Number(req.params.sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }
  try {
    const state = await getSessionState(sessionId);
    if (!state) return res.status(404).json({ error: 'Session not found' });
    res.json(state);
  } catch (err) {
    console.error('Error getting session state', err);
    res.status(500).json({ error: 'Failed to get session state' });
  }
});

router.post(
  '/sessions/:sessionId/start',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }
    await setSessionStatus(sessionId, 'live');
    res.status(204).send();
  },
);

router.post(
  '/sessions/:sessionId/close',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }
    const result = await closeSessionOrDeleteIfEmpty(sessionId);
    res.json(result);
  },
);

router.post(
  '/sessions/:sessionId/rounds',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }

    const { variant = null, seed = null } = req.body ?? {};
    if (variant != null && typeof variant !== 'string') {
      return res.status(400).json({ error: 'variant must be a string when provided' });
    }
    if (seed != null && typeof seed !== 'string') {
      return res.status(400).json({ error: 'seed must be a string when provided' });
    }

    try {
      const variantId = variant != null ? await getVariantCodeByName(variant) : 0;
      const round = await createSessionRound({
        sessionId,
        seedPayload: encodeRoundSeedPayload({ variant_id: variantId, seed }),
      });
      res.status(201).json(round);
    } catch (err) {
      console.error('Error creating session round', err);
      res.status(500).json({ error: 'Failed to create game for session' });
    }
  },
);

router.post(
  '/sessions/:sessionId/rounds/reorder',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }

    const roundIds = Array.isArray(req.body?.round_ids)
      ? req.body.round_ids.map((v: unknown) => Number(v))
      : [];
    if (
      roundIds.length === 0 ||
      roundIds.some((id: number) => !Number.isInteger(id) || id <= 0) ||
      new Set(roundIds).size !== roundIds.length
    ) {
      return res.status(400).json({ error: 'round_ids must be a non-empty array of unique IDs' });
    }

    try {
      await reorderSessionRounds({ sessionId, roundIds });
      res.status(204).send();
    } catch (err) {
      if ((err as Error).message === 'NO_PENDING_ROUNDS') {
        return res.status(400).json({ error: 'No pending games to reorder' });
      }
      if ((err as Error).message === 'ROUND_IDS_MISMATCH') {
        return res
          .status(400)
          .json({ error: 'round_ids must match all pending games in the session' });
      }
      console.error('Error reordering session rounds', err);
      res.status(500).json({ error: 'Failed to reorder games' });
    }
  },
);

router.post(
  '/sessions/:sessionId/assign-next-round',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }

    const {
      seed_payload = null,
      override_missing_scores = false,
      override_reason = null,
    } = req.body ?? {};
    const result = await assignNextRound({
      sessionId,
      seedPayload: seed_payload,
      overrideMissingScores: Boolean(override_missing_scores),
      overrideReason: override_reason,
    });
    if (result.blocked) {
      return res.status(409).json(result);
    }
    res.json(result);
  },
);

router.post(
  '/rounds/:roundId/submit-score',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const roundId = Number(req.params.roundId);
    const teamNo = Number(req.body?.team_no);
    const score = Number(req.body?.score);
    const replayGameIdRaw = req.body?.replay_game_id;
    const endConditionRaw = req.body?.end_condition;
    const bottomDeckRiskRaw = req.body?.bottom_deck_risk;
    const replayGameId =
      replayGameIdRaw == null || replayGameIdRaw === '' ? null : Number(replayGameIdRaw);
    const endCondition =
      endConditionRaw == null || endConditionRaw === '' ? null : Number(endConditionRaw);
    const bottomDeckRisk =
      bottomDeckRiskRaw == null || bottomDeckRiskRaw === '' ? null : Number(bottomDeckRiskRaw);
    if (!Number.isInteger(roundId) || roundId <= 0) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
    if (!Number.isInteger(teamNo) || teamNo <= 0) {
      return res.status(400).json({ error: 'team_no must be a positive integer' });
    }
    if (!Number.isFinite(score)) {
      return res.status(400).json({ error: 'score must be a number' });
    }
    if (replayGameId != null && (!Number.isInteger(replayGameId) || replayGameId <= 0)) {
      return res
        .status(400)
        .json({ error: 'replay_game_id must be a positive integer when provided' });
    }
    if (endCondition != null && !Number.isInteger(endCondition)) {
      return res.status(400).json({ error: 'end_condition must be an integer when provided' });
    }
    if (bottomDeckRisk != null && (!Number.isFinite(bottomDeckRisk) || bottomDeckRisk < 0)) {
      return res
        .status(400)
        .json({ error: 'bottom_deck_risk must be a non-negative number when provided' });
    }

    const eventId = await getRoundEventId(roundId);
    if (!eventId) return res.status(404).json({ error: 'Round not found' });
    const conceded = await hasConcededEventSpoilers({
      eventId,
      userId: req.user!.userId,
    });
    if (conceded) {
      return res.status(403).json({
        error: 'You have conceded spoiler protection for this event and can no longer participate.',
        code: 'INELIGIBLE_CONCEDED',
      });
    }

    const allowed = await canSubmitTeamScore({
      roundId,
      userId: req.user!.userId,
      teamNo,
    });
    if (!allowed) {
      return res.status(403).json({ error: 'You are not assigned to this team for this round' });
    }

    const row = await submitRoundScore({
      roundId,
      teamNo,
      score,
      submittedByUserId: req.user!.userId,
      replayGameId,
      endCondition,
      bottomDeckRisk,
    });
    res.status(201).json(row);
  },
);

router.post(
  '/rounds/:roundId/validate-replay',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const roundId = Number(req.params.roundId);
    const teamNo = Number(req.body?.team_no);
    const replay = typeof req.body?.replay === 'string' ? req.body.replay : '';

    if (!Number.isInteger(roundId) || roundId <= 0) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
    if (!Number.isInteger(teamNo) || teamNo <= 0) {
      return res.status(400).json({ error: 'team_no must be a positive integer' });
    }
    if (!replay.trim()) {
      return res.status(400).json({ error: 'replay is required' });
    }

    const eventId = await getRoundEventId(roundId);
    if (!eventId) return res.status(404).json({ error: 'Round not found' });
    const conceded = await hasConcededEventSpoilers({
      eventId,
      userId: req.user!.userId,
    });
    if (conceded) {
      return res.status(403).json({
        error: 'You have conceded spoiler protection for this event and can no longer participate.',
        code: 'INELIGIBLE_CONCEDED',
      });
    }

    const allowed = await canSubmitTeamScore({
      roundId,
      userId: req.user!.userId,
      teamNo,
    });
    if (!allowed) {
      return res.status(403).json({ error: 'You are not assigned to this team for this round' });
    }

    const gameId = parseGameId(replay);
    if (!gameId) {
      return res.status(400).json({ error: 'Unable to parse game id from replay/link' });
    }

    const context = await getRoundTeamReplayValidationContext({ roundId, teamNo });
    if (!context) return res.status(404).json({ error: 'Round not found' });
    if (context.team_players.length === 0) {
      return res.status(400).json({ error: 'No team players found for this round/team' });
    }

    const expected = parseSeedPayload(context.seed_payload);
    const expectedVariantId = expected.variant_id;
    const expectedSeed = (expected.seed ?? '').trim();

    try {
      const exportJson = await fetchJsonWithTimeout(`https://hanab.live/export/${gameId}`);
      if (!exportJson || typeof exportJson !== 'object') {
        return res.status(400).json({ error: 'Invalid export payload from hanab.live' });
      }

      const exportPlayers = extractReplayExportPlayers(exportJson);
      if (!exportPlayers || exportPlayers.length === 0) {
        return res.status(400).json({ error: 'Replay export is missing a valid players list' });
      }
      const seedString = String(exportJson.seed ?? '');
      const expectedPlayers = context.team_players;
      const duplicatePlayers = exportPlayers.filter(
        (player, index) => exportPlayers.indexOf(player) !== index,
      );
      if (duplicatePlayers.length > 0) {
        return res.status(400).json({
          error: `Replay includes duplicate players: ${[...new Set(duplicatePlayers)].join(', ')}`,
        });
      }

      const unexpectedPlayers = exportPlayers.filter((p) => !expectedPlayers.includes(p));
      if (unexpectedPlayers.length > 0) {
        return res.status(400).json({
          error: `Replay includes players not on this team: ${unexpectedPlayers.join(', ')}`,
        });
      }
      const missingPlayers = expectedPlayers.filter((p) => !exportPlayers.includes(p));
      if (missingPlayers.length > 0 || exportPlayers.length !== expectedPlayers.length) {
        return res.status(400).json({
          error: `Replay team must exactly match assigned players: ${expectedPlayers.join(', ')}`,
        });
      }

      const seedMatch = seedString.match(/p(\d+)v(\d+)s([A-Za-z0-9]+)/);
      if (!seedMatch) {
        return res.status(400).json({ error: 'Seed string from replay is not in expected format' });
      }
      const seedVariantId = Number(seedMatch[2]);
      const seedSuffix = seedMatch[3];
      if (expectedSeed && seedSuffix !== expectedSeed) {
        return res.status(400).json({
          error: `Replay seed ${seedSuffix} does not match expected seed ${expectedSeed}`,
        });
      }

      const historyData = await fetchJsonWithTimeout(
        `https://hanab.live/api/v1/history-full/${encodeURIComponent(context.team_players[0])}?start=${gameId}&end=${gameId}`,
      );

      const historyGames = extractReplayHistoryGames<ReplayHistoryGame>(historyData);
      const game = historyGames.find(
        (g: ReplayHistoryGame) => String(g.id ?? g.gameId ?? g.game_id) === String(gameId),
      );
      if (!game) {
        return res.status(400).json({ error: 'Unable to find replay game in player history' });
      }

      const opts = game.options ?? {};
      const historyVariantId = opts.variantID ?? null;
      if (historyVariantId != null && historyVariantId !== seedVariantId) {
        return res.status(400).json({
          error: `Replay variant ID ${historyVariantId} does not match seed variant ID ${seedVariantId}`,
        });
      }
      if (
        expectedVariantId != null &&
        historyVariantId != null &&
        historyVariantId !== expectedVariantId
      ) {
        return res.status(400).json({
          error: `Replay variant ID ${historyVariantId} does not match expected variant ID ${expectedVariantId}`,
        });
      }

      const score = Number(game.score ?? NaN);
      if (!Number.isFinite(score)) {
        return res.status(400).json({ error: 'Unable to derive score from replay' });
      }

      const endCondition = normalizeReplayEndCondition(game.endCondition);

      return res.json({
        ok: true,
        gameId,
        export: {
          players: exportPlayers,
          seed: seedString,
        },
        derived: {
          variantId: historyVariantId ?? expectedVariantId,
          score,
          endCondition,
          playedAt:
            game.datetimeFinished ?? game.datetimeFinishedUtc ?? game.datetime_finished ?? null,
        },
      });
    } catch (err) {
      const message = (err as Error).message ?? 'Failed to validate replay';
      if (message === 'timeout') {
        return res.status(504).json({ error: 'Validation timed out contacting hanab.live' });
      }
      return res.status(502).json({ error: `Failed to validate replay: ${message}` });
    }
  },
);

router.post(
  '/rounds/:roundId/finalize',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const roundId = Number(req.params.roundId);
    if (!Number.isInteger(roundId) || roundId <= 0) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
    const eventId = await getRoundEventId(roundId);
    if (!eventId) return res.status(404).json({ error: 'Round not found' });
    if (
      !(await canManageEvent({
        eventId,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }

    try {
      const result = await finalizeRoundElo(roundId);
      res.json(result);
    } catch (err) {
      const message = (err as Error).message;
      if (message === 'ROUND_NOT_FOUND') {
        return res.status(404).json({ error: 'Round not found' });
      }
      if (message === 'NEED_AT_LEAST_ONE_TEAM') {
        return res.status(400).json({ error: 'Need at least one team with submitted scores' });
      }
      console.error('Finalize round error', err);
      res.status(500).json({ error: 'Failed to finalize round' });
    }
  },
);

router.post(
  '/sessions/:sessionId/role',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const { role } = req.body ?? {};
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (role !== 'playing' && role !== 'spectating') {
      return res.status(400).json({ error: 'role must be "playing" or "spectating"' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (role === 'playing') {
      const conceded = await hasConcededEventSpoilers({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
      });
      if (conceded) {
        return res.status(403).json({
          error:
            'You have conceded spoiler protection for this event and can no longer participate.',
          code: 'INELIGIBLE_CONCEDED',
        });
      }
    }
    try {
      await setSessionPresence({
        sessionId,
        userId: req.user!.userId,
        role,
        state: 'online',
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error setting role', err);
      res.status(500).json({ error: 'Failed to set role' });
    }
  },
);

router.post(
  '/sessions/:sessionId/presence',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const { state = 'online', role = 'spectating' } = req.body ?? {};
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (role !== 'playing' && role !== 'spectating') {
      return res.status(400).json({ error: 'role must be "playing" or "spectating"' });
    }
    if (state !== 'online' && state !== 'offline') {
      return res.status(400).json({ error: 'state must be "online" or "offline"' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (role === 'playing') {
      const conceded = await hasConcededEventSpoilers({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
      });
      if (conceded) {
        return res.status(403).json({
          error:
            'You have conceded spoiler protection for this event and can no longer participate.',
          code: 'INELIGIBLE_CONCEDED',
        });
      }
    }
    try {
      await setSessionPresence({
        sessionId,
        userId: req.user!.userId,
        role,
        state,
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error updating presence', err);
      res.status(500).json({ error: 'Failed to update presence' });
    }
  },
);

router.post(
  '/sessions/:sessionId/ready-check/start',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }
    const durationSecondsRaw = Number(req.body?.duration_seconds ?? 10);
    const durationSeconds =
      Number.isFinite(durationSecondsRaw) && durationSecondsRaw >= 5 && durationSecondsRaw <= 30
        ? Math.floor(durationSecondsRaw)
        : 10;
    try {
      const result = await startReadyCheckForNextRound({
        sessionId,
        initiatedByUserId: req.user!.userId,
        durationSeconds,
      });
      if (result.blocked) {
        if (result.reason === 'NO_PENDING_ROUNDS') {
          return res.status(409).json({ reason: result.reason, error: 'No pending games left.' });
        }
        if (result.reason === 'SEED_REQUIRED') {
          return res
            .status(409)
            .json({ reason: result.reason, error: 'Next game is missing a variant or seed.' });
        }
        return res.status(409).json({ error: 'Unable to start ready check.' });
      }
      res.json(result);
    } catch (err) {
      console.error('Error starting ready check', err);
      res.status(500).json({ error: 'Failed to start ready check' });
    }
  },
);

router.post(
  '/sessions/:sessionId/ready-check/respond',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    const conceded = await hasConcededEventSpoilers({
      eventId: sessionInfo.event_id,
      userId: req.user!.userId,
    });
    if (conceded) {
      return res.status(403).json({
        error: 'You have conceded spoiler protection for this event and can no longer participate.',
        code: 'INELIGIBLE_CONCEDED',
      });
    }
    const isReady = Boolean(req.body?.is_ready);
    try {
      const result = await submitReadyCheckResponse({
        sessionId,
        userId: req.user!.userId,
        isReady,
      });
      if (!result.ok) {
        if (result.reason === 'NO_READY_CHECK') {
          return res.status(409).json({ reason: result.reason, error: 'No active ready check.' });
        }
        if (result.reason === 'READY_CHECK_CLOSED') {
          return res
            .status(409)
            .json({ reason: result.reason, error: 'Ready check is no longer open.' });
        }
        return res.status(409).json({ error: 'Unable to submit ready response.' });
      }
      res.status(204).send();
    } catch (err) {
      console.error('Error submitting ready response', err);
      res.status(500).json({ error: 'Failed to submit ready response' });
    }
  },
);

router.post(
  '/sessions/:sessionId/ready-check/finalize',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }
    try {
      const result = await finalizeReadyCheckAndAssignNextRound({ sessionId });
      if (result.blocked) {
        if (result.reason === 'NO_OPEN_READY_CHECK') {
          return res.status(409).json({ reason: result.reason, error: 'No open ready check.' });
        }
        return res
          .status(409)
          .json({ reason: result.reason, error: 'Unable to finalize ready check.' });
      }
      res.json(result);
    } catch (err) {
      console.error('Error finalizing ready check', err);
      res.status(500).json({ error: 'Failed to finalize ready check' });
    }
  },
);

router.post(
  '/sessions/:sessionId/presence/:userId/remove',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const sessionId = Number(req.params.sessionId);
    const userId = Number(req.params.userId);
    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: 'Invalid sessionId' });
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: 'Invalid userId' });
    }

    const sessionInfo = await getSessionEventInfo(sessionId);
    if (!sessionInfo) return res.status(404).json({ error: 'Session not found' });
    if (
      !(await canManageEvent({
        eventId: sessionInfo.event_id,
        userId: req.user!.userId,
        userRole: req.user!.role,
      }))
    ) {
      return res.status(403).json({ error: 'Manager access required for this event' });
    }

    try {
      await setSessionPresence({
        sessionId,
        userId,
        role: 'playing',
        state: 'offline',
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error removing participant', err);
      res.status(500).json({ error: 'Failed to remove participant' });
    }
  },
);

export default router;
