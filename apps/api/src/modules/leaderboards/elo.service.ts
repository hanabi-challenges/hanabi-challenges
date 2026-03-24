import { pool } from '../../config/db';
import type { PoolClient } from 'pg';

// ---------------------------------------------------------------------------
// ELO computation utility
// ---------------------------------------------------------------------------
// ELO is per-player on CHALLENGE stages (or SEEDED_LEADERBOARD stages) with
// stage_scoring_config_json: { method: "elo", k_factor: N, participation_bonus: N }.
//
// Ratings are scoped to the stage's group when one exists, or to the stage
// itself for ungrouped individual play. This lets ELO propagate across all
// stages within a group while still working for a single standalone stage.
//
// For each game result, all teams that played the same game slot are compared.
// When a team has no opponents, outcome is treated as 'draw' (participation
// bonus only).
// ---------------------------------------------------------------------------

export type EloOutcome = 'win' | 'loss' | 'draw';

export type EloConfig = {
  kFactor: number;
  participationBonus: number;
};

export type EloDeltaResult = {
  newRating: number;
  delta: number; // includes participation bonus
};

/**
 * Compute the new ELO rating for a player given their current rating,
 * opponent ratings, outcome, and config.
 *
 * When opponentRatings is empty (no opponents), the outcome is forced to
 * 'draw' and only the participation bonus applies.
 */
export function computeEloDeltas(
  teamRating: number,
  opponentRatings: number[],
  outcome: EloOutcome,
  config: EloConfig,
): EloDeltaResult {
  const { kFactor, participationBonus } = config;

  // No opponents → treat as draw, participation bonus only
  if (opponentRatings.length === 0) {
    return {
      newRating: teamRating + participationBonus,
      delta: participationBonus,
    };
  }

  // Expected score: average of 1-vs-1 expectations against each opponent
  const expectedSum = opponentRatings.reduce((acc, oppRating) => {
    return acc + 1 / (1 + Math.pow(10, (oppRating - teamRating) / 400));
  }, 0);
  const expectedScore = expectedSum / opponentRatings.length;

  // Actual score
  const actualScore = outcome === 'win' ? 1 : outcome === 'loss' ? 0 : 0.5;

  const eloDelta = kFactor * (actualScore - expectedScore);
  const totalDelta = eloDelta + participationBonus;

  return {
    newRating: teamRating + totalDelta,
    delta: totalDelta,
  };
}

/**
 * Derive the outcome for a team given their score vs a list of opponent scores
 * on the same game slot.
 *
 * Win: scored strictly higher than ALL opponents.
 * Loss: scored strictly lower than ALL opponents.
 * Draw: otherwise (mixed results or ties with everyone).
 */
export function deriveOutcome(teamScore: number, opponentScores: number[]): EloOutcome {
  if (opponentScores.length === 0) return 'draw';

  const allWins = opponentScores.every((s) => teamScore > s);
  const allLosses = opponentScores.every((s) => teamScore < s);

  if (allWins) return 'win';
  if (allLosses) return 'loss';
  return 'draw';
}

// ---------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------
// ELO ratings are keyed on (group_id, user_id) when the stage belongs to a
// group, or (stage_id, user_id) for ungrouped stages. Exactly one of the two
// FK columns is non-null (enforced by DB constraint).

type EloScope = { type: 'group'; id: number } | { type: 'stage'; id: number };

async function resolveEloScope(stageId: number, q: typeof pool | PoolClient): Promise<EloScope> {
  const res = await q.query<{ group_id: number | null }>(
    `SELECT group_id FROM event_stages WHERE id = $1`,
    [stageId],
  );
  const groupId = res.rows[0]?.group_id ?? null;
  return groupId !== null ? { type: 'group', id: groupId } : { type: 'stage', id: stageId };
}

function scopeWhere(scope: EloScope): { clause: string; param: number } {
  return scope.type === 'group'
    ? { clause: 'group_id = $1 AND stage_id IS NULL', param: scope.id }
    : { clause: 'stage_id = $1 AND group_id IS NULL', param: scope.id };
}

function scopeInsertCols(scope: EloScope): { cols: string; scopeVal: number } {
  return scope.type === 'group'
    ? { cols: 'group_id', scopeVal: scope.id }
    : { cols: 'stage_id', scopeVal: scope.id };
}

// ---------------------------------------------------------------------------
// ELO rating materialization
// ---------------------------------------------------------------------------
// Called after a game result is inserted for a stage with method: "elo".
// Fetches all opponent scores for the same game slot, computes ELO deltas,
// and upserts into event_player_ratings (one row per team member).
//
// Passing an optional pg PoolClient allows this to run inside a transaction.
// ---------------------------------------------------------------------------

type StageScoringConfig = {
  method?: string;
  k_factor?: number;
  participation_bonus?: number;
};

export async function maybeUpdateEloRatings(
  stageGameId: number,
  teamId: number,
  newScore: number,
  client?: PoolClient,
): Promise<void> {
  const q = client ?? pool;

  // 1. Resolve stage and scoring config
  const stageRes = await q.query<{
    stage_id: number;
    stage_scoring_config_json: StageScoringConfig;
  }>(
    `SELECT es.id AS stage_id, es.stage_scoring_config_json
     FROM event_stage_games esg
     JOIN event_stages es ON es.id = esg.stage_id
     WHERE esg.id = $1`,
    [stageGameId],
  );
  if (stageRes.rowCount === 0) return;

  const { stage_id: stageId, stage_scoring_config_json } = stageRes.rows[0];
  const config: StageScoringConfig = stage_scoring_config_json ?? {};
  if (config.method !== 'elo') return;

  const kFactor = config.k_factor ?? 24;
  const participationBonus = config.participation_bonus ?? 0;
  const eloConfig: EloConfig = { kFactor, participationBonus };

  // 2. Resolve ELO scope (group or standalone stage)
  const scope = await resolveEloScope(stageId, q);
  const { clause: whereClause } = scopeWhere(scope);
  const { cols: scopeCol, scopeVal } = scopeInsertCols(scope);

  // 3. Get team members
  const membersRes = await q.query<{ user_id: number }>(
    `SELECT user_id FROM event_team_members WHERE event_team_id = $1 AND confirmed = TRUE`,
    [teamId],
  );
  const memberUserIds = membersRes.rows.map((r) => r.user_id);
  if (memberUserIds.length === 0) return;

  // 4. Get current ratings for this team's members (default 1000)
  const currentRatingsRes = await q.query<{ user_id: number; rating: string }>(
    `SELECT user_id, rating FROM event_player_ratings WHERE ${whereClause} AND user_id = ANY($2)`,
    [scopeVal, memberUserIds],
  );
  const currentRatings = new Map<number, number>();
  for (const r of currentRatingsRes.rows) {
    currentRatings.set(r.user_id, Number(r.rating));
  }

  const teamAvgRating =
    memberUserIds.reduce((sum, uid) => sum + (currentRatings.get(uid) ?? 1000), 0) /
    memberUserIds.length;

  // 5. Get other teams' scores on this game slot (excluding the submitting team)
  const opponentScoresRes = await q.query<{ event_team_id: number; score: number }>(
    `SELECT egr.event_team_id, egr.score
     FROM event_game_results egr
     WHERE egr.stage_game_id = $1 AND egr.event_team_id != $2`,
    [stageGameId, teamId],
  );
  const opponentRows = opponentScoresRes.rows;

  // 6. Resolve opponent team avg ratings
  let opponentTeamAvgRatings: number[] = [];
  if (opponentRows.length > 0) {
    const opponentTeamIds = opponentRows.map((r) => r.event_team_id);
    const opponentMembersRes = await q.query<{ event_team_id: number; user_id: number }>(
      `SELECT event_team_id, user_id FROM event_team_members
       WHERE event_team_id = ANY($1) AND confirmed = TRUE`,
      [opponentTeamIds],
    );
    const allOppUserIds = opponentMembersRes.rows.map((r) => r.user_id);
    const oppRatingsRes = await q.query<{ user_id: number; rating: string }>(
      `SELECT user_id, rating FROM event_player_ratings
       WHERE ${whereClause} AND user_id = ANY($2)`,
      [scopeVal, allOppUserIds],
    );
    const oppRatingMap = new Map<number, number>();
    for (const r of oppRatingsRes.rows) oppRatingMap.set(r.user_id, Number(r.rating));

    const membersByOppTeam = new Map<number, number[]>();
    for (const m of opponentMembersRes.rows) {
      if (!membersByOppTeam.has(m.event_team_id)) membersByOppTeam.set(m.event_team_id, []);
      membersByOppTeam.get(m.event_team_id)!.push(m.user_id);
    }

    opponentTeamAvgRatings = opponentTeamIds.map((tid) => {
      const members = membersByOppTeam.get(tid) ?? [];
      if (members.length === 0) return 1000;
      return (
        members.reduce((sum, uid) => sum + (oppRatingMap.get(uid) ?? 1000), 0) / members.length
      );
    });
  }

  // 7. Derive outcome and compute delta
  const opponentScores = opponentRows.map((r) => r.score);
  const outcome = deriveOutcome(newScore, opponentScores);
  const { newRating } = computeEloDeltas(teamAvgRating, opponentTeamAvgRatings, outcome, eloConfig);
  const ratingDelta = newRating - teamAvgRating;

  // 8. Upsert ratings for each team member
  // ON CONFLICT predicate must exactly match the partial unique index definition.
  const conflictClause =
    scope.type === 'group'
      ? `ON CONFLICT (group_id, user_id) WHERE group_id IS NOT NULL`
      : `ON CONFLICT (stage_id, user_id) WHERE stage_id IS NOT NULL`;

  for (const userId of memberUserIds) {
    const currentRating = currentRatings.get(userId) ?? 1000;
    const updatedRating = currentRating + ratingDelta;

    await q.query(
      `INSERT INTO event_player_ratings (${scopeCol}, user_id, rating, games_played, last_played_at, updated_at)
       VALUES ($1, $2, $3, 1, NOW(), NOW())
       ${conflictClause} DO UPDATE SET
         rating         = $3,
         games_played   = event_player_ratings.games_played + 1,
         last_played_at = NOW(),
         updated_at     = NOW()`,
      [scopeVal, userId, updatedRating.toFixed(3)],
    );
  }
}
