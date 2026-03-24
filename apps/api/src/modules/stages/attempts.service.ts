import { pool } from '../../config/db';
import type { ResultResponse } from '../results/results.service';
import { listResultsForGame } from '../results/results.service';
import { evaluateAwards } from '../awards/awards-evaluation.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AttemptRow = {
  id: number;
  event_team_id: number;
  stage_id: number;
  attempt_number: number;
  completed: boolean;
  abandoned: boolean;
  total_score: number | null;
  started_at: Date;
  completed_at: Date | null;
};

export type AttemptDetail = AttemptRow & {
  results: ResultResponse[];
  running_score: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function computeAttemptScore(attemptId: number, stageId: number): Promise<number> {
  const stageRow = await pool.query<{ game_metric: string }>(
    `SELECT game_metric FROM event_stages WHERE id = $1`,
    [stageId],
  );
  const gameMetric = stageRow.rows[0]?.game_metric ?? 'SCORE';

  if (gameMetric === 'MAX_SCORE') {
    const result = await pool.query<{ total: string }>(
      `SELECT COUNT(*) AS total
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       WHERE egr.attempt_id = $1 AND egr.score = esg.max_score`,
      [attemptId],
    );
    return parseInt(result.rows[0].total, 10);
  }

  const result = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(egr.score), 0) AS total
     FROM event_game_results egr
     WHERE egr.attempt_id = $1`,
    [attemptId],
  );
  return parseInt(result.rows[0].total, 10);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listAttempts(stageId: number, teamId: number): Promise<AttemptRow[]> {
  const result = await pool.query<AttemptRow>(
    `SELECT * FROM event_gauntlet_attempts
     WHERE stage_id = $1 AND event_team_id = $2
     ORDER BY attempt_number`,
    [stageId, teamId],
  );
  return result.rows;
}

export async function listAllAttempts(stageId: number): Promise<AttemptRow[]> {
  const result = await pool.query<AttemptRow>(
    `SELECT * FROM event_gauntlet_attempts WHERE stage_id = $1 ORDER BY event_team_id, attempt_number`,
    [stageId],
  );
  return result.rows;
}

export async function getAttemptDetail(
  attemptId: number,
  stageId: number,
): Promise<AttemptDetail | null> {
  const result = await pool.query<AttemptRow>(
    `SELECT * FROM event_gauntlet_attempts WHERE id = $1 AND stage_id = $2`,
    [attemptId, stageId],
  );
  if (result.rowCount === 0) return null;

  const attempt = result.rows[0];

  // Fetch all game slots for this stage in order
  const gamesResult = await pool.query<{ id: number }>(
    `SELECT id FROM event_stage_games WHERE stage_id = $1 ORDER BY game_index`,
    [stageId],
  );

  // Fetch results for this attempt (one per game slot)
  const allResults: ResultResponse[] = [];
  for (const game of gamesResult.rows) {
    const gameResults = await pool.query<{ id: number }>(
      `SELECT * FROM event_game_results
       WHERE stage_game_id = $1 AND attempt_id = $2`,
      [game.id, attemptId],
    );
    if (gameResults.rowCount && gameResults.rowCount > 0) {
      const enriched = await listResultsForGame(game.id, undefined);
      // Filter to this attempt only
      const forAttempt = enriched.filter((r) => r.attempt_id === attemptId);
      allResults.push(...forAttempt);
    }
  }

  const runningScore = await computeAttemptScore(attemptId, stageId);

  return { ...attempt, results: allResults, running_score: runningScore };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

export type StartAttemptResult =
  | { ok: true; attempt: AttemptRow }
  | {
      ok: false;
      reason:
        | 'wrong_stage_mechanism'
        | 'no_team'
        | 'in_progress_attempt_exists'
        | 'attempt_limit_reached';
    };

export async function startAttempt(stageId: number, userId: number): Promise<StartAttemptResult> {
  // Stage must have GAUNTLET mechanism; also fetch attempt_policy and config_json
  const stageCheck = await pool.query<{
    mechanism: string;
    attempt_policy: string;
    config_json: Record<string, unknown>;
  }>(`SELECT mechanism, attempt_policy, config_json FROM event_stages WHERE id = $1`, [stageId]);
  if (stageCheck.rowCount === 0 || stageCheck.rows[0].mechanism !== 'GAUNTLET') {
    return { ok: false, reason: 'wrong_stage_mechanism' };
  }
  const { attempt_policy, config_json } = stageCheck.rows[0];

  // Find user's confirmed team for this stage
  const teamResult = await pool.query<{ id: number }>(
    `SELECT DISTINCT et.id
     FROM event_teams et
     JOIN event_team_members etm ON etm.event_team_id = et.id
     WHERE et.stage_id = $1 AND etm.user_id = $2 AND etm.confirmed = TRUE
     LIMIT 1`,
    [stageId, userId],
  );
  if (teamResult.rowCount === 0) {
    return { ok: false, reason: 'no_team' };
  }
  const teamId = teamResult.rows[0].id;

  // Block if there is an in-progress (not completed, not abandoned) attempt for this team+stage
  const inProgressCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_gauntlet_attempts
     WHERE event_team_id = $1 AND stage_id = $2 AND completed = FALSE AND abandoned = FALSE`,
    [teamId, stageId],
  );
  if (parseInt(inProgressCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'in_progress_attempt_exists' };
  }

  // Enforce attempt limit for BEST_OF_N — count only non-abandoned attempts
  if (attempt_policy === 'BEST_OF_N') {
    const n = (config_json?.best_of_n as number) ?? null;
    if (n !== null) {
      const countResult = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM event_gauntlet_attempts
         WHERE event_team_id = $1 AND stage_id = $2 AND abandoned = FALSE`,
        [teamId, stageId],
      );
      if (parseInt(countResult.rows[0].count, 10) >= n) {
        return { ok: false, reason: 'attempt_limit_reached' };
      }
    }
  }

  // Determine next attempt_number
  const lastAttemptResult = await pool.query<{ max: number | null }>(
    `SELECT MAX(attempt_number) AS max FROM event_gauntlet_attempts
     WHERE event_team_id = $1 AND stage_id = $2`,
    [teamId, stageId],
  );
  const nextNumber = (lastAttemptResult.rows[0].max ?? 0) + 1;

  const insertResult = await pool.query<AttemptRow>(
    `INSERT INTO event_gauntlet_attempts (event_team_id, stage_id, attempt_number)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [teamId, stageId, nextNumber],
  );

  return { ok: true, attempt: insertResult.rows[0] };
}

// ---------------------------------------------------------------------------
// Abandon (T-041)
// ---------------------------------------------------------------------------

export type AbandonAttemptResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not_found' | 'already_completed' | 'already_abandoned' | 'not_authorized';
    };

export async function abandonAttempt(
  attemptId: number,
  stageId: number,
  userId: number,
  isAdmin: boolean,
): Promise<AbandonAttemptResult> {
  const result = await pool.query<AttemptRow>(
    `SELECT * FROM event_gauntlet_attempts WHERE id = $1 AND stage_id = $2`,
    [attemptId, stageId],
  );
  if ((result.rowCount ?? 0) === 0) return { ok: false, reason: 'not_found' };
  const attempt = result.rows[0];

  if (attempt.completed) return { ok: false, reason: 'already_completed' };
  if (attempt.abandoned) return { ok: false, reason: 'already_abandoned' };

  if (!isAdmin) {
    const memberCheck = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM event_team_members
       WHERE event_team_id = $1 AND user_id = $2 AND confirmed = TRUE`,
      [attempt.event_team_id, userId],
    );
    if (parseInt(memberCheck.rows[0].count, 10) === 0) {
      return { ok: false, reason: 'not_authorized' };
    }
  }

  await pool.query(`UPDATE event_gauntlet_attempts SET abandoned = TRUE WHERE id = $1`, [
    attemptId,
  ]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Complete
// ---------------------------------------------------------------------------

export type CompleteAttemptResult =
  | { ok: true; attempt: AttemptRow }
  | { ok: false; reason: 'not_found' | 'already_completed' | 'missing_results' | 'not_authorized' };

export async function completeAttempt(
  attemptId: number,
  stageId: number,
  userId: number,
  isAdmin: boolean,
): Promise<CompleteAttemptResult> {
  const attemptResult = await pool.query<AttemptRow>(
    `SELECT * FROM event_gauntlet_attempts WHERE id = $1 AND stage_id = $2`,
    [attemptId, stageId],
  );
  if (attemptResult.rowCount === 0) {
    return { ok: false, reason: 'not_found' };
  }
  const attempt = attemptResult.rows[0];

  if (attempt.completed) {
    return { ok: false, reason: 'already_completed' };
  }

  // Verify caller is on the team (unless admin)
  if (!isAdmin) {
    const memberCheck = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM event_team_members
       WHERE event_team_id = $1 AND user_id = $2 AND confirmed = TRUE`,
      [attempt.event_team_id, userId],
    );
    if (parseInt(memberCheck.rows[0].count, 10) === 0) {
      return { ok: false, reason: 'not_authorized' };
    }
  }

  // All game slots for this stage must have results for this attempt
  const missingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_stage_games esg
     LEFT JOIN event_game_results egr
       ON egr.stage_game_id = esg.id AND egr.attempt_id = $1
     WHERE esg.stage_id = $2 AND egr.id IS NULL`,
    [attemptId, stageId],
  );
  if (parseInt(missingCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'missing_results' };
  }

  // Compute total_score respecting game_metric
  const totalScore = await computeAttemptScore(attemptId, stageId);

  const updatedResult = await pool.query<AttemptRow>(
    `UPDATE event_gauntlet_attempts
     SET completed = TRUE, total_score = $1, completed_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [totalScore, attemptId],
  );

  // Trigger award re-evaluation for this stage (T-042)
  try {
    const eventRow = await pool.query<{ event_id: number }>(
      `SELECT event_id FROM event_stages WHERE id = $1`,
      [stageId],
    );
    if ((eventRow.rowCount ?? 0) > 0) {
      await evaluateAwards(eventRow.rows[0].event_id, stageId);
    }
  } catch {
    // Non-fatal: award evaluation failure should not block completion
  }

  return { ok: true, attempt: updatedResult.rows[0] };
}
