import { pool } from '../../config/db';
import { registerUser } from '../registrations/registrations.service';
import { maybeUpdateEloRatings } from '../leaderboards/elo.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ResultParticipant = {
  user_id: number;
  display_name: string;
};

export type ResultRow = {
  id: number;
  event_team_id: number;
  stage_game_id: number;
  attempt_id: number | null;
  score: number;
  zero_reason: string | null;
  bottom_deck_risk: number | null;
  hanabi_live_game_id: number | null;
  started_at: Date | null;
  played_at: Date;
  created_at: Date;
  corrected_by: number | null;
  corrected_at: Date | null;
};

export type ResultResponse = ResultRow & {
  participants: ResultParticipant[];
};

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function attachParticipants(rows: ResultRow[]): Promise<ResultResponse[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const pResult = await pool.query<{
    game_result_id: number;
    user_id: number;
    display_name: string;
  }>(
    `SELECT p.game_result_id, p.user_id, u.display_name
     FROM event_game_result_participants p
     JOIN users u ON u.id = p.user_id
     WHERE p.game_result_id = ANY($1)
     ORDER BY u.display_name`,
    [ids],
  );

  const byResult = new Map<number, ResultParticipant[]>();
  for (const p of pResult.rows) {
    if (!byResult.has(p.game_result_id)) byResult.set(p.game_result_id, []);
    byResult.get(p.game_result_id)!.push({ user_id: p.user_id, display_name: p.display_name });
  }

  return rows.map((r) => ({ ...r, participants: byResult.get(r.id) ?? [] }));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listResultsForGame(
  stageGameId: number,
  userId?: number,
): Promise<ResultResponse[]> {
  let result;
  if (userId !== undefined) {
    result = await pool.query<ResultRow>(
      `SELECT DISTINCT egr.*
       FROM event_game_results egr
       JOIN event_team_members etm ON etm.event_team_id = egr.event_team_id
       WHERE egr.stage_game_id = $1 AND etm.user_id = $2
       ORDER BY egr.played_at DESC`,
      [stageGameId, userId],
    );
  } else {
    result = await pool.query<ResultRow>(
      `SELECT * FROM event_game_results WHERE stage_game_id = $1 ORDER BY score DESC, played_at`,
      [stageGameId],
    );
  }
  return attachParticipants(result.rows);
}

export async function listResultsForStage(
  stageId: number,
  userId?: number,
): Promise<ResultResponse[]> {
  let result;
  if (userId !== undefined) {
    result = await pool.query<ResultRow>(
      `SELECT DISTINCT egr.*
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       JOIN event_team_members etm ON etm.event_team_id = egr.event_team_id
       WHERE esg.stage_id = $1 AND etm.user_id = $2
       ORDER BY egr.played_at DESC`,
      [stageId, userId],
    );
  } else {
    result = await pool.query<ResultRow>(
      `SELECT egr.*
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       WHERE esg.stage_id = $1
       ORDER BY esg.game_index, egr.score DESC, egr.played_at`,
      [stageId],
    );
  }
  return attachParticipants(result.rows);
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SubmitResultInput = {
  teamId: number;
  score: number;
  zeroReason?: string | null;
  bottomDeckRisk?: number | null;
  hanabiLiveGameId?: number | null;
  startedAt?: string | null;
  playedAt?: string | null;
  attemptId?: number | null;
};

export type SubmitResultContext = {
  eventId: number;
  stageGameId: number;
  stageGameTeamSize: number | null;
  stageGameMaxScore: number | null;
  submitterUserId: number;
  isAdmin: boolean;
  eventMeta: {
    registration_mode: string;
    registration_cutoff: Date | null;
    allow_late_registration: boolean;
  };
};

export type SubmitResultResult =
  | { ok: true; result: ResultResponse }
  | {
      ok: false;
      reason:
        | 'team_not_found'
        | 'not_on_team'
        | 'team_size_mismatch'
        | 'score_too_high'
        | 'zero_needs_reason'
        | 'duplicate'
        | 'registration_cutoff'
        | 'out_of_order';
    };

export async function submitResult(
  ctx: SubmitResultContext,
  input: SubmitResultInput,
): Promise<SubmitResultResult> {
  const {
    eventId,
    stageGameId,
    stageGameTeamSize,
    stageGameMaxScore,
    submitterUserId,
    isAdmin,
    eventMeta,
  } = ctx;

  // Validate team belongs to this event
  const teamResult = await pool.query<{ id: number; team_size: number; event_id: number }>(
    `SELECT id, team_size, event_id FROM event_teams WHERE id = $1`,
    [input.teamId],
  );
  if (teamResult.rowCount === 0 || teamResult.rows[0].event_id !== eventId) {
    return { ok: false, reason: 'team_not_found' };
  }
  const team = teamResult.rows[0];

  // Team size must match the game's required size (if set)
  if (stageGameTeamSize !== null && stageGameTeamSize !== team.team_size) {
    return { ok: false, reason: 'team_size_mismatch' };
  }

  // Submitter must be a confirmed team member (unless admin)
  if (!isAdmin) {
    const memberCheck = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM event_team_members
       WHERE event_team_id = $1 AND user_id = $2 AND confirmed = TRUE`,
      [input.teamId, submitterUserId],
    );
    if (parseInt(memberCheck.rows[0].count, 10) === 0) {
      return { ok: false, reason: 'not_on_team' };
    }
  }

  // Score validation
  if (input.score === 0 && !input.zeroReason) {
    return { ok: false, reason: 'zero_needs_reason' };
  }
  if (stageGameMaxScore !== null && input.score > stageGameMaxScore) {
    return { ok: false, reason: 'score_too_high' };
  }

  // Passive registration: auto-register the submitter if event uses PASSIVE mode
  if (eventMeta.registration_mode === 'PASSIVE') {
    const regResult = await registerUser(eventId, submitterUserId, eventMeta);
    if (regResult.ok === false) {
      return { ok: false, reason: 'registration_cutoff' };
    }
  }

  // Ordering validation for gauntlet attempts:
  // All game slots with game_index < this game's game_index must already have results for this attempt
  if (input.attemptId !== null && input.attemptId !== undefined) {
    const currentGameRow = await pool.query<{ game_index: number; stage_id: number }>(
      `SELECT game_index, stage_id FROM event_stage_games WHERE id = $1`,
      [stageGameId],
    );
    if (currentGameRow.rowCount !== null && currentGameRow.rowCount > 0) {
      const { game_index, stage_id } = currentGameRow.rows[0];
      if (game_index > 1) {
        const prevGamesCheck = await pool.query<{ count: string }>(
          `SELECT COUNT(*) AS count
           FROM event_stage_games esg
           LEFT JOIN event_game_results egr
             ON egr.stage_game_id = esg.id AND egr.attempt_id = $1
           WHERE esg.stage_id = $2 AND esg.game_index < $3 AND egr.id IS NULL`,
          [input.attemptId, stage_id, game_index],
        );
        if (parseInt(prevGamesCheck.rows[0].count, 10) > 0) {
          return { ok: false, reason: 'out_of_order' };
        }
      }
    }
  }

  // Insert result
  let resultId: number;
  try {
    const insertResult = await pool.query<{ id: number }>(
      `INSERT INTO event_game_results
         (event_team_id, stage_game_id, attempt_id, score, zero_reason, bottom_deck_risk,
          hanabi_live_game_id, started_at, played_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, COALESCE($9::timestamptz, NOW()))
       RETURNING id`,
      [
        input.teamId,
        stageGameId,
        input.attemptId ?? null,
        input.score,
        input.zeroReason ?? null,
        input.bottomDeckRisk ?? null,
        input.hanabiLiveGameId ?? null,
        input.startedAt ?? null,
        input.playedAt ?? null,
      ],
    );
    resultId = insertResult.rows[0].id;
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return { ok: false, reason: 'duplicate' };
    }
    throw err;
  }

  // Record participants — all confirmed team members
  const membersResult = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM event_team_members WHERE event_team_id = $1 AND confirmed = TRUE`,
    [input.teamId],
  );
  for (const m of membersResult.rows) {
    await pool.query(
      `INSERT INTO event_game_result_participants (game_result_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [resultId, m.user_id],
    );
  }

  // ELO rating materialization (no-op for non-ELO stages)
  await maybeUpdateEloRatings(stageGameId, input.teamId, input.score);

  const rows = await pool.query<ResultRow>(`SELECT * FROM event_game_results WHERE id = $1`, [
    resultId,
  ]);
  const [full] = await attachParticipants(rows.rows);
  return { ok: true, result: full };
}

// ---------------------------------------------------------------------------
// Admin: get result by id (within an event)
// ---------------------------------------------------------------------------

export async function getResult(resultId: number, eventId: number): Promise<ResultResponse | null> {
  const result = await pool.query<ResultRow>(
    `SELECT egr.*
     FROM event_game_results egr
     JOIN event_teams et ON et.id = egr.event_team_id
     WHERE egr.id = $1 AND et.event_id = $2`,
    [resultId, eventId],
  );
  if (result.rowCount === 0) return null;
  const [full] = await attachParticipants(result.rows);
  return full;
}

// ---------------------------------------------------------------------------
// Admin: update result
// ---------------------------------------------------------------------------

export type UpdateResultInput = {
  score?: number;
  zeroReason?: string | null;
  bottomDeckRisk?: number | null;
  hanabiLiveGameId?: number | null;
  startedAt?: string | null;
  playedAt?: string | null;
  correctedBy: number;
};

export type UpdateResultResult =
  | { ok: true; result: ResultResponse }
  | { ok: false; reason: 'not_found' | 'score_too_high' | 'zero_needs_reason' };

export async function updateResult(
  resultId: number,
  eventId: number,
  input: UpdateResultInput,
): Promise<UpdateResultResult> {
  const existing = await getResult(resultId, eventId);
  if (!existing) return { ok: false, reason: 'not_found' };

  const newScore = input.score !== undefined ? input.score : existing.score;
  const newZeroReason = input.zeroReason !== undefined ? input.zeroReason : existing.zero_reason;

  // Get max_score for this game
  const gameRow = await pool.query<{ max_score: number | null }>(
    `SELECT max_score FROM event_stage_games WHERE id = $1`,
    [existing.stage_game_id],
  );
  const maxScore = gameRow.rows[0]?.max_score ?? null;

  if (newScore === 0 && !newZeroReason) {
    return { ok: false, reason: 'zero_needs_reason' };
  }
  if (maxScore !== null && newScore > maxScore) {
    return { ok: false, reason: 'score_too_high' };
  }

  const newPlayedAt = input.playedAt !== undefined ? input.playedAt : null;

  await pool.query(
    `UPDATE event_game_results SET
       score               = $1,
       zero_reason         = $2,
       bottom_deck_risk    = $3,
       hanabi_live_game_id = $4,
       started_at          = $5::timestamptz,
       played_at           = COALESCE($6::timestamptz, NOW()),
       corrected_by        = $7,
       corrected_at        = NOW()
     WHERE id = $8`,
    [
      newScore,
      newZeroReason ?? null,
      input.bottomDeckRisk !== undefined ? input.bottomDeckRisk : existing.bottom_deck_risk,
      input.hanabiLiveGameId !== undefined ? input.hanabiLiveGameId : existing.hanabi_live_game_id,
      input.startedAt !== undefined ? input.startedAt : existing.started_at,
      newPlayedAt,
      input.correctedBy,
      resultId,
    ],
  );

  const updated = await getResult(resultId, eventId);
  return { ok: true, result: updated! };
}

// ---------------------------------------------------------------------------
// Admin: delete result
// ---------------------------------------------------------------------------

export type DeleteResultResult = { ok: true } | { ok: false; reason: 'not_found' };

export async function deleteResult(resultId: number, eventId: number): Promise<DeleteResultResult> {
  const existing = await getResult(resultId, eventId);
  if (!existing) return { ok: false, reason: 'not_found' };

  // Participants cascade via FK ON DELETE CASCADE
  await pool.query(`DELETE FROM event_game_results WHERE id = $1`, [resultId]);
  return { ok: true };
}
