import { pool } from '../../config/db';
import { deriveTeamDisplayName } from '../../utils/team.utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';

export type MatchRow = {
  id: number;
  stage_id: number;
  round_number: number;
  team1_id: number;
  team2_id: number;
  status: MatchStatus;
  winner_team_id: number | null;
  created_at: Date;
};

export type MatchGameResultRow = {
  id: number;
  match_id: number;
  game_index: number;
  variant_id: number | null;
  seed_payload: string | null;
  team1_score: number | null;
  team2_score: number | null;
  created_at: Date;
};

type TeamMemberRow = { user_id: number; display_name: string; confirmed: boolean };

export type MatchResponse = MatchRow & {
  team1_display_name: string;
  team2_display_name: string;
  game_results: MatchGameResultRow[];
};

// ---------------------------------------------------------------------------
// Internal helper — enrich matches with team display names and game results
// ---------------------------------------------------------------------------

async function enrichMatches(rows: MatchRow[], includeResults: boolean): Promise<MatchResponse[]> {
  if (rows.length === 0) return [];

  // Collect all team IDs
  const teamIds = new Set<number>();
  for (const r of rows) {
    teamIds.add(r.team1_id);
    teamIds.add(r.team2_id);
  }

  // Fetch members for all teams (for display name derivation)
  const membersResult = await pool.query<TeamMemberRow & { event_team_id: number }>(
    `SELECT etm.event_team_id, etm.user_id, u.display_name, etm.confirmed
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1)
     ORDER BY u.display_name`,
    [Array.from(teamIds)],
  );

  const membersByTeam = new Map<number, TeamMemberRow[]>();
  for (const m of membersResult.rows) {
    const { event_team_id, ...member } = m;
    if (!membersByTeam.has(event_team_id)) membersByTeam.set(event_team_id, []);
    membersByTeam.get(event_team_id)!.push(member);
  }

  // Fetch game results if needed
  const matchIds = rows.map((r) => r.id);
  const gameResultsByMatch = new Map<number, MatchGameResultRow[]>();
  if (includeResults) {
    const grResult = await pool.query<MatchGameResultRow>(
      `SELECT * FROM event_match_game_results WHERE match_id = ANY($1) ORDER BY match_id, game_index`,
      [matchIds],
    );
    for (const gr of grResult.rows) {
      if (!gameResultsByMatch.has(gr.match_id)) gameResultsByMatch.set(gr.match_id, []);
      gameResultsByMatch.get(gr.match_id)!.push(gr);
    }
  }

  return rows.map((r) => ({
    ...r,
    team1_display_name: deriveTeamDisplayName(membersByTeam.get(r.team1_id) ?? []),
    team2_display_name: deriveTeamDisplayName(membersByTeam.get(r.team2_id) ?? []),
    game_results: gameResultsByMatch.get(r.id) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Auto-compute winner from game results
// ---------------------------------------------------------------------------

async function recomputeWinner(matchId: number, team1Id: number, team2Id: number): Promise<void> {
  const scoresResult = await pool.query<{ team1_total: string; team2_total: string }>(
    `SELECT
       COALESCE(SUM(team1_score), 0) AS team1_total,
       COALESCE(SUM(team2_score), 0) AS team2_total
     FROM event_match_game_results
     WHERE match_id = $1`,
    [matchId],
  );
  const team1Total = parseInt(scoresResult.rows[0].team1_total, 10);
  const team2Total = parseInt(scoresResult.rows[0].team2_total, 10);

  let winnerId: number | null = null;
  if (team1Total > team2Total) winnerId = team1Id;
  else if (team2Total > team1Total) winnerId = team2Id;

  await pool.query(`UPDATE event_matches SET winner_team_id = $1 WHERE id = $2`, [
    winnerId,
    matchId,
  ]);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listMatches(stageId: number): Promise<MatchResponse[]> {
  const result = await pool.query<MatchRow>(
    `SELECT * FROM event_matches WHERE stage_id = $1 ORDER BY round_number, id`,
    [stageId],
  );
  return enrichMatches(result.rows, false);
}

export async function getMatchDetail(
  matchId: number,
  stageId: number,
): Promise<MatchResponse | null> {
  const result = await pool.query<MatchRow>(
    `SELECT * FROM event_matches WHERE id = $1 AND stage_id = $2`,
    [matchId, stageId],
  );
  if (result.rowCount === 0) return null;
  const enriched = await enrichMatches(result.rows, true);
  return enriched[0];
}

// ---------------------------------------------------------------------------
// Status update (admin)
// ---------------------------------------------------------------------------

const STATUS_ORDER: Record<MatchStatus, number> = { PENDING: 0, IN_PROGRESS: 1, COMPLETE: 2 };

export type UpdateStatusResult =
  | { ok: true; match: MatchResponse }
  | { ok: false; reason: 'not_found' | 'invalid_transition' };

export async function updateMatchStatus(
  matchId: number,
  stageId: number,
  newStatus: MatchStatus,
): Promise<UpdateStatusResult> {
  const existing = await getMatchDetail(matchId, stageId);
  if (!existing) return { ok: false, reason: 'not_found' };

  if (STATUS_ORDER[newStatus] <= STATUS_ORDER[existing.status]) {
    return { ok: false, reason: 'invalid_transition' };
  }

  await pool.query(`UPDATE event_matches SET status = $1 WHERE id = $2`, [newStatus, matchId]);

  const updated = await getMatchDetail(matchId, stageId);
  return { ok: true, match: updated! };
}

// ---------------------------------------------------------------------------
// Submit game result for a match
// ---------------------------------------------------------------------------

export type SubmitMatchGameResultInput = {
  gameIndex: number;
  team1Score: number;
  team2Score: number;
  variantId?: number | null;
  seedPayload?: string | null;
};

export type SubmitMatchGameResultResult =
  | { ok: true; match: MatchResponse }
  | { ok: false; reason: 'not_found' | 'duplicate' };

export async function submitMatchGameResult(
  matchId: number,
  stageId: number,
  input: SubmitMatchGameResultInput,
): Promise<SubmitMatchGameResultResult> {
  const existing = await getMatchDetail(matchId, stageId);
  if (!existing) return { ok: false, reason: 'not_found' };

  try {
    await pool.query(
      `INSERT INTO event_match_game_results
         (match_id, game_index, variant_id, seed_payload, team1_score, team2_score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (match_id, game_index) DO UPDATE SET
         variant_id   = EXCLUDED.variant_id,
         seed_payload = EXCLUDED.seed_payload,
         team1_score  = EXCLUDED.team1_score,
         team2_score  = EXCLUDED.team2_score`,
      [
        matchId,
        input.gameIndex,
        input.variantId ?? null,
        input.seedPayload ?? null,
        input.team1Score,
        input.team2Score,
      ],
    );
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

  // Auto-compute winner after any result change
  await recomputeWinner(matchId, existing.team1_id, existing.team2_id);

  const updated = await getMatchDetail(matchId, stageId);
  return { ok: true, match: updated! };
}

// ---------------------------------------------------------------------------
// Set winner (admin override)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Set match game variant/seed (admin override — T-040)
// ---------------------------------------------------------------------------

export type SetMatchGameVariantSeedResult =
  | { ok: true; game: MatchGameResultRow }
  | { ok: false; reason: 'not_found' };

export async function setMatchGameVariantSeed(
  matchId: number,
  stageId: number,
  gameIndex: number,
  variantId: number | null,
  seedPayload: string | null,
): Promise<SetMatchGameVariantSeedResult> {
  const match = await getMatchDetail(matchId, stageId);
  if (!match) return { ok: false, reason: 'not_found' };

  const result = await pool.query<MatchGameResultRow>(
    `UPDATE event_match_game_results
     SET variant_id = $1, seed_payload = $2
     WHERE match_id = $3 AND game_index = $4
     RETURNING *`,
    [variantId, seedPayload, matchId, gameIndex],
  );

  if ((result.rowCount ?? 0) === 0) {
    // Skeleton doesn't exist yet — insert it
    const inserted = await pool.query<MatchGameResultRow>(
      `INSERT INTO event_match_game_results (match_id, game_index, variant_id, seed_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, game_index) DO UPDATE SET
         variant_id   = EXCLUDED.variant_id,
         seed_payload = EXCLUDED.seed_payload
       RETURNING *`,
      [matchId, gameIndex, variantId, seedPayload],
    );
    return { ok: true, game: inserted.rows[0] };
  }

  return { ok: true, game: result.rows[0] };
}

export type SetWinnerResult =
  | { ok: true; match: MatchResponse }
  | { ok: false; reason: 'not_found' | 'invalid_team' };

export async function setMatchWinner(
  matchId: number,
  stageId: number,
  winnerTeamId: number | null,
): Promise<SetWinnerResult> {
  const existing = await getMatchDetail(matchId, stageId);
  if (!existing) return { ok: false, reason: 'not_found' };

  // winnerTeamId must be team1 or team2 (or null to clear)
  if (
    winnerTeamId !== null &&
    winnerTeamId !== existing.team1_id &&
    winnerTeamId !== existing.team2_id
  ) {
    return { ok: false, reason: 'invalid_team' };
  }

  await pool.query(`UPDATE event_matches SET winner_team_id = $1 WHERE id = $2`, [
    winnerTeamId,
    matchId,
  ]);

  const updated = await getMatchDetail(matchId, stageId);
  return { ok: true, match: updated! };
}
