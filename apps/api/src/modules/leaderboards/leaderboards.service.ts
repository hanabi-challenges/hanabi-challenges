import { pool } from '../../config/db';
import { deriveTeamDisplayName } from '../../utils/team.utils';

// ---------------------------------------------------------------------------
// Config types (per T-003)
// ---------------------------------------------------------------------------

type Tiebreaker = 'bdr_desc' | 'bdr_asc' | 'turns_remaining_desc' | 'turns_remaining_asc';

type GameScoringConfig = {
  primary?: 'score';
  tiebreakers?: Tiebreaker[];
};

type StageScoringConfig = {
  method?: 'sum' | 'best_attempt' | 'win_loss' | 'elo';
};

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type GameScore = {
  game_index: number;
  score: number;
  bdr: number | null;
};

export type LeaderboardMember = {
  user_id: number;
  display_name: string;
};

export type LeaderboardEntry = {
  rank: number;
  team_size: number;
  team: {
    id: number;
    display_name: string;
    members: LeaderboardMember[];
  };
  stage_score: number;
  game_scores: GameScore[];
};

export type SeededLeaderboard = {
  combined_leaderboard: boolean;
  entries: LeaderboardEntry[];
};

// ---------------------------------------------------------------------------
// Pure ranking computation (exported for unit tests)
// ---------------------------------------------------------------------------

export type RankableTeam = {
  team_id: number;
  team_size: number;
  stage_score: number;
  game_scores: GameScore[];
  total_bdr: number | null;
  members: LeaderboardMember[];
  display_name: string;
};

export function computeSeededRankings(
  teams: RankableTeam[],
  tiebreakers: Tiebreaker[],
  combined: boolean,
): LeaderboardEntry[] {
  function compare(a: RankableTeam, b: RankableTeam): number {
    if (b.stage_score !== a.stage_score) return b.stage_score - a.stage_score;

    for (const tb of tiebreakers) {
      if (tb === 'bdr_desc') {
        const diff = (b.total_bdr ?? 0) - (a.total_bdr ?? 0);
        if (diff !== 0) return diff;
      } else if (tb === 'bdr_asc') {
        const diff = (a.total_bdr ?? 0) - (b.total_bdr ?? 0);
        if (diff !== 0) return diff;
      }
      // turns_remaining not yet in schema — skip
    }
    return 0;
  }

  function assignRanks(sorted: RankableTeam[]): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && compare(sorted[i], sorted[i - 1]) !== 0) {
        rank = i + 1;
      }
      const e = sorted[i];
      entries.push({
        rank,
        team_size: e.team_size,
        team: { id: e.team_id, display_name: e.display_name, members: e.members },
        stage_score: e.stage_score,
        game_scores: e.game_scores,
      });
    }
    return entries;
  }

  if (combined) {
    return assignRanks([...teams].sort(compare));
  }

  // Per-track: rank within each team_size group, ordered by team_size then rank
  const bySize = new Map<number, RankableTeam[]>();
  for (const t of teams) {
    if (!bySize.has(t.team_size)) bySize.set(t.team_size, []);
    bySize.get(t.team_size)!.push(t);
  }

  const allEntries: LeaderboardEntry[] = [];
  for (const [, group] of [...bySize.entries()].sort((a, b) => a[0] - b[0])) {
    allEntries.push(...assignRanks([...group].sort(compare)));
  }
  return allEntries;
}

// ---------------------------------------------------------------------------
// DB-backed service
// ---------------------------------------------------------------------------

export async function getSeededLeaderboard(stageId: number): Promise<SeededLeaderboard | null> {
  const stageResult = await pool.query<{
    mechanism: string;
    game_scoring_config_json: GameScoringConfig;
    stage_scoring_config_json: StageScoringConfig;
    combined_leaderboard: boolean;
    group_id: number | null;
  }>(
    `SELECT es.mechanism, es.game_scoring_config_json, es.stage_scoring_config_json,
            e.combined_leaderboard, es.group_id
     FROM event_stages es
     JOIN events e ON e.id = es.event_id
     WHERE es.id = $1`,
    [stageId],
  );
  if (stageResult.rowCount === 0) return null;

  const stage = stageResult.rows[0];
  const gameConfig: GameScoringConfig = stage.game_scoring_config_json ?? {};
  const stageConfig: StageScoringConfig = stage.stage_scoring_config_json ?? {};
  const method = stageConfig.method ?? 'sum';
  const tiebreakers: Tiebreaker[] = gameConfig.tiebreakers ?? [];
  const combined = stage.combined_leaderboard;
  // ELO scope: use group_id when the stage belongs to a group, stage_id otherwise
  const eloScopeCol = stage.group_id !== null ? 'group_id' : 'stage_id';
  const eloScopeVal = stage.group_id ?? stageId;
  const eloScopeFilter = stage.group_id !== null ? 'stage_id IS NULL' : 'group_id IS NULL';

  // Fetch all game results for this stage's games
  const resultsResult = await pool.query<{
    team_id: number;
    team_size: number;
    game_index: number;
    score: number;
    bdr: number | null;
  }>(
    `SELECT
       et.id    AS team_id,
       et.team_size,
       esg.game_index,
       egr.score,
       egr.bottom_deck_risk AS bdr
     FROM event_game_results egr
     JOIN event_stage_games esg ON esg.id = egr.stage_game_id
     JOIN event_teams et ON et.id = egr.event_team_id
     WHERE esg.stage_id = $1 AND egr.attempt_id IS NULL
     ORDER BY et.id, esg.game_index`,
    [stageId],
  );

  if (resultsResult.rows.length === 0) {
    return { combined_leaderboard: combined, entries: [] };
  }

  // Group results by team
  const teamMap = new Map<number, { team_size: number; game_scores: GameScore[] }>();
  for (const row of resultsResult.rows) {
    if (!teamMap.has(row.team_id)) {
      teamMap.set(row.team_id, { team_size: row.team_size, game_scores: [] });
    }
    teamMap.get(row.team_id)!.game_scores.push({
      game_index: row.game_index,
      score: row.score,
      bdr: row.bdr,
    });
  }

  // Fetch members for all teams
  const teamIds = Array.from(teamMap.keys());
  const membersResult = await pool.query<{
    event_team_id: number;
    user_id: number;
    display_name: string;
    confirmed: boolean;
  }>(
    `SELECT etm.event_team_id, etm.user_id, u.display_name, etm.confirmed
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1)
     ORDER BY u.display_name`,
    [teamIds],
  );

  const membersByTeam = new Map<number, LeaderboardMember[]>();
  for (const m of membersResult.rows) {
    if (!membersByTeam.has(m.event_team_id)) membersByTeam.set(m.event_team_id, []);
    membersByTeam.get(m.event_team_id)!.push({ user_id: m.user_id, display_name: m.display_name });
  }

  // For ELO stages, fetch current player ratings to use as the stage score
  let eloRatingByTeam: Map<number, number> | null = null;
  if (method === 'elo') {
    const allMemberIds = Array.from(teamMap.keys()).flatMap((tid) =>
      (membersByTeam.get(tid) ?? []).map((m) => m.user_id),
    );
    if (allMemberIds.length > 0) {
      const eloRes = await pool.query<{ user_id: number; rating: string }>(
        `SELECT user_id, rating FROM event_player_ratings
         WHERE ${eloScopeCol} = $1 AND ${eloScopeFilter} AND user_id = ANY($2)`,
        [eloScopeVal, allMemberIds],
      );
      const eloByUser = new Map<number, number>();
      for (const r of eloRes.rows) eloByUser.set(r.user_id, Number(r.rating));

      eloRatingByTeam = new Map();
      for (const [tid] of teamMap) {
        const members = membersByTeam.get(tid) ?? [];
        const avgRating =
          members.length > 0
            ? members.reduce((sum, m) => sum + (eloByUser.get(m.user_id) ?? 1000), 0) /
              members.length
            : 1000;
        eloRatingByTeam.set(tid, avgRating);
      }
    }
  }

  // Build rankable team entries
  const rankableTeams: RankableTeam[] = [];
  for (const [teamId, data] of teamMap) {
    let stageScore = 0;
    if (method === 'sum') {
      stageScore = data.game_scores.reduce((acc, g) => acc + g.score, 0);
    } else if (method === 'elo') {
      stageScore = eloRatingByTeam?.get(teamId) ?? 1000;
    }

    const scores = data.game_scores;
    const totalBdr = scores.some((g) => g.bdr !== null)
      ? scores.reduce((acc, g) => acc + (g.bdr ?? 0), 0)
      : null;

    const members = membersByTeam.get(teamId) ?? [];
    const displayName = deriveTeamDisplayName(members);

    rankableTeams.push({
      team_id: teamId,
      team_size: data.team_size,
      stage_score: stageScore,
      game_scores: scores,
      total_bdr: totalBdr,
      members,
      display_name: displayName,
    });
  }

  const entries = computeSeededRankings(rankableTeams, tiebreakers, combined);
  return { combined_leaderboard: combined, entries };
}

// ---------------------------------------------------------------------------
// GAUNTLET leaderboard types
// ---------------------------------------------------------------------------

export type GauntletLeaderboardEntry = {
  rank: number | null; // null = DNF
  dnf: boolean;
  team_size: number;
  team: {
    id: number;
    display_name: string;
    members: LeaderboardMember[];
  };
  stage_score: number | null;
  best_attempt_number: number | null;
  game_scores: GameScore[];
};

export type GauntletLeaderboard = {
  entries: GauntletLeaderboardEntry[];
};

// ---------------------------------------------------------------------------
// Pure GAUNTLET ranking computation (exported for unit tests)
// ---------------------------------------------------------------------------

export type RankableGauntletTeam = {
  team_id: number;
  team_size: number;
  total_score: number;
  best_attempt_number: number;
  game_scores: GameScore[];
  total_bdr: number | null;
  members: LeaderboardMember[];
  display_name: string;
};

export type DnfGauntletTeam = {
  team_id: number;
  team_size: number;
  members: LeaderboardMember[];
  display_name: string;
};

export function computeGauntletRankings(
  ranked: RankableGauntletTeam[],
  dnfTeams: DnfGauntletTeam[],
  tiebreakers: Tiebreaker[],
): GauntletLeaderboardEntry[] {
  function compare(a: RankableGauntletTeam, b: RankableGauntletTeam): number {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;

    for (const tb of tiebreakers) {
      if (tb === 'bdr_desc') {
        const diff = (b.total_bdr ?? 0) - (a.total_bdr ?? 0);
        if (diff !== 0) return diff;
      } else if (tb === 'bdr_asc') {
        const diff = (a.total_bdr ?? 0) - (b.total_bdr ?? 0);
        if (diff !== 0) return diff;
      }
    }
    return 0;
  }

  const sorted = [...ranked].sort(compare);

  const entries: GauntletLeaderboardEntry[] = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && compare(sorted[i], sorted[i - 1]) !== 0) {
      rank = i + 1;
    }
    const e = sorted[i];
    entries.push({
      rank,
      dnf: false,
      team_size: e.team_size,
      team: { id: e.team_id, display_name: e.display_name, members: e.members },
      stage_score: e.total_score,
      best_attempt_number: e.best_attempt_number,
      game_scores: e.game_scores,
    });
  }

  // Append DNF teams (no complete attempt) at the bottom
  for (const d of dnfTeams) {
    entries.push({
      rank: null,
      dnf: true,
      team_size: d.team_size,
      team: { id: d.team_id, display_name: d.display_name, members: d.members },
      stage_score: null,
      best_attempt_number: null,
      game_scores: [],
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// DB-backed GAUNTLET service
// ---------------------------------------------------------------------------

export async function getGauntletLeaderboard(stageId: number): Promise<GauntletLeaderboard | null> {
  // Verify stage exists
  const stageResult = await pool.query<{
    game_scoring_config_json: GameScoringConfig;
  }>(`SELECT game_scoring_config_json FROM event_stages WHERE id = $1`, [stageId]);
  if (stageResult.rowCount === 0) return null;

  const gameConfig: GameScoringConfig = stageResult.rows[0].game_scoring_config_json ?? {};
  const tiebreakers: Tiebreaker[] = gameConfig.tiebreakers ?? [];

  // Best complete attempt per team
  const bestAttemptsResult = await pool.query<{
    team_id: number;
    attempt_id: number;
    best_attempt_number: number;
    total_score: number;
    team_size: number;
  }>(
    `SELECT DISTINCT ON (ega.event_team_id)
       ega.event_team_id  AS team_id,
       ega.id             AS attempt_id,
       ega.attempt_number AS best_attempt_number,
       ega.total_score,
       et.team_size
     FROM event_gauntlet_attempts ega
     JOIN event_teams et ON et.id = ega.event_team_id
     WHERE ega.stage_id = $1 AND ega.completed = TRUE
     ORDER BY ega.event_team_id, ega.total_score DESC, ega.attempt_number ASC`,
    [stageId],
  );

  // Teams with attempts but no complete attempt (DNF)
  const dnfResult = await pool.query<{ team_id: number; team_size: number }>(
    `SELECT DISTINCT ega.event_team_id AS team_id, et.team_size
     FROM event_gauntlet_attempts ega
     JOIN event_teams et ON et.id = ega.event_team_id
     WHERE ega.stage_id = $1
       AND ega.event_team_id NOT IN (
         SELECT event_team_id FROM event_gauntlet_attempts
         WHERE stage_id = $1 AND completed = TRUE
       )`,
    [stageId],
  );

  if (bestAttemptsResult.rows.length === 0 && dnfResult.rows.length === 0) {
    return { entries: [] };
  }

  // Fetch game scores for best attempts
  const attemptIds = bestAttemptsResult.rows.map((r) => r.attempt_id);
  const gameScoresByAttempt = new Map<number, GameScore[]>();

  if (attemptIds.length > 0) {
    const gsResult = await pool.query<{
      attempt_id: number;
      game_index: number;
      score: number;
      bdr: number | null;
    }>(
      `SELECT egr.attempt_id, esg.game_index, egr.score, egr.bottom_deck_risk AS bdr
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       WHERE egr.attempt_id = ANY($1)
       ORDER BY egr.attempt_id, esg.game_index`,
      [attemptIds],
    );
    for (const row of gsResult.rows) {
      if (!gameScoresByAttempt.has(row.attempt_id)) gameScoresByAttempt.set(row.attempt_id, []);
      gameScoresByAttempt.get(row.attempt_id)!.push({
        game_index: row.game_index,
        score: row.score,
        bdr: row.bdr,
      });
    }
  }

  // Collect all team IDs and fetch members
  const allTeamIds = [
    ...bestAttemptsResult.rows.map((r) => r.team_id),
    ...dnfResult.rows.map((r) => r.team_id),
  ];

  const membersResult = await pool.query<{
    event_team_id: number;
    user_id: number;
    display_name: string;
  }>(
    `SELECT etm.event_team_id, etm.user_id, u.display_name
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1)
     ORDER BY u.display_name`,
    [allTeamIds],
  );

  const membersByTeam = new Map<number, LeaderboardMember[]>();
  for (const m of membersResult.rows) {
    if (!membersByTeam.has(m.event_team_id)) membersByTeam.set(m.event_team_id, []);
    membersByTeam.get(m.event_team_id)!.push({ user_id: m.user_id, display_name: m.display_name });
  }

  // Build ranked teams
  const rankableTeams: RankableGauntletTeam[] = bestAttemptsResult.rows.map((r) => {
    const scores = gameScoresByAttempt.get(r.attempt_id) ?? [];
    const totalBdr = scores.some((g) => g.bdr !== null)
      ? scores.reduce((acc, g) => acc + (g.bdr ?? 0), 0)
      : null;
    const members = membersByTeam.get(r.team_id) ?? [];
    return {
      team_id: r.team_id,
      team_size: r.team_size,
      total_score: Number(r.total_score),
      best_attempt_number: r.best_attempt_number,
      game_scores: scores,
      total_bdr: totalBdr,
      members,
      display_name: deriveTeamDisplayName(members),
    };
  });

  // Build DNF teams
  const dnfTeams: DnfGauntletTeam[] = dnfResult.rows.map((r) => {
    const members = membersByTeam.get(r.team_id) ?? [];
    return {
      team_id: r.team_id,
      team_size: r.team_size,
      members,
      display_name: deriveTeamDisplayName(members),
    };
  });

  const entries = computeGauntletRankings(rankableTeams, dnfTeams, tiebreakers);
  return { entries };
}

// ---------------------------------------------------------------------------
// MATCH_PLAY standings types
// ---------------------------------------------------------------------------

export type MatchGameResult = {
  id: number;
  game_index: number;
  team1_score: number | null;
  team2_score: number | null;
};

export type StandingsMatch = {
  id: number;
  round_number: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  team1: { id: number; display_name: string };
  team2: { id: number; display_name: string };
  winner_team_id: number | null;
  game_results: MatchGameResult[];
};

export type StandingsRound = {
  round_number: number;
  matches: StandingsMatch[];
};

export type StandingsEntry = {
  team: { id: number; display_name: string; members: LeaderboardMember[] };
  status: 'active' | 'eliminated' | 'champion';
  placement: number | null; // null when still active; 1 = champion, 2 = runner-up, 3 = tied 3rd, etc.
};

export type MatchPlayStandings = {
  rounds: StandingsRound[];
  entries: StandingsEntry[];
  current_round: number | null;
};

// ---------------------------------------------------------------------------
// Input type for the pure computation function
// ---------------------------------------------------------------------------

export type RawMatchData = {
  id: number;
  round_number: number;
  team1_id: number;
  team2_id: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  winner_team_id: number | null;
  game_results: MatchGameResult[];
};

export type RawTeamData = {
  id: number;
  display_name: string;
  members: LeaderboardMember[];
};

// ---------------------------------------------------------------------------
// Pure MATCH_PLAY standings computation (exported for unit tests)
// ---------------------------------------------------------------------------

export function computeMatchPlayStandings(
  matches: RawMatchData[],
  teams: Map<number, RawTeamData>,
): MatchPlayStandings {
  if (matches.length === 0) {
    return { rounds: [], entries: [], current_round: null };
  }

  const maxRound = Math.max(...matches.map((m) => m.round_number));

  // Group matches into rounds
  const roundMap = new Map<number, RawMatchData[]>();
  for (const m of matches) {
    if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
    roundMap.get(m.round_number)!.push(m);
  }

  // Build rounds array (sorted by round_number)
  const rounds: StandingsRound[] = [...roundMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rn, rmatches]) => ({
      round_number: rn,
      matches: rmatches.map((m) => ({
        id: m.id,
        round_number: m.round_number,
        status: m.status,
        team1: { id: m.team1_id, display_name: teams.get(m.team1_id)?.display_name ?? 'Unknown' },
        team2: { id: m.team2_id, display_name: teams.get(m.team2_id)?.display_name ?? 'Unknown' },
        winner_team_id: m.winner_team_id,
        game_results: m.game_results,
      })),
    }));

  // Determine current_round: highest round with any PENDING or IN_PROGRESS match
  let currentRound: number | null = null;
  for (const [rn, rmatches] of roundMap) {
    if (rmatches.some((m) => m.status !== 'COMPLETE')) {
      if (currentRound === null || rn < currentRound) currentRound = rn;
    }
  }
  // If all matches are complete, current_round = null (bracket finished)

  // Collect all team IDs from matches
  const allTeamIds = new Set<number>();
  for (const m of matches) {
    allTeamIds.add(m.team1_id);
    allTeamIds.add(m.team2_id);
  }

  // Determine each team's status and placement
  const entries: StandingsEntry[] = [];

  for (const teamId of allTeamIds) {
    const teamData = teams.get(teamId) ?? { id: teamId, display_name: 'Unknown', members: [] };

    // Find any completed match where this team lost
    const lossMatch = matches.find(
      (m) =>
        m.status === 'COMPLETE' &&
        m.winner_team_id !== null &&
        m.winner_team_id !== teamId &&
        (m.team1_id === teamId || m.team2_id === teamId),
    );

    if (lossMatch) {
      // Eliminated — compute placement
      const eliminatedInRound = lossMatch.round_number;
      const placement =
        eliminatedInRound === maxRound
          ? 2 // runner-up (lost the final)
          : Math.pow(2, maxRound - eliminatedInRound) + 1;
      entries.push({
        team: { id: teamId, display_name: teamData.display_name, members: teamData.members },
        status: 'eliminated',
        placement,
      });
    } else {
      // Check for champion: won a match in maxRound, no pending/in-progress matches remain in maxRound,
      // and has no match set up in a higher round
      const wonFinal = matches.some(
        (m) =>
          m.round_number === maxRound && m.status === 'COMPLETE' && m.winner_team_id === teamId,
      );
      const finalRoundComplete = matches
        .filter((m) => m.round_number === maxRound)
        .every((m) => m.status === 'COMPLETE');
      const hasHigherRoundMatch = matches.some(
        (m) => m.round_number > maxRound && (m.team1_id === teamId || m.team2_id === teamId),
      );

      if (wonFinal && finalRoundComplete && !hasHigherRoundMatch) {
        entries.push({
          team: { id: teamId, display_name: teamData.display_name, members: teamData.members },
          status: 'champion',
          placement: 1,
        });
      } else {
        entries.push({
          team: { id: teamId, display_name: teamData.display_name, members: teamData.members },
          status: 'active',
          placement: null,
        });
      }
    }
  }

  // Sort: champion first, then active (by team id for stability), then eliminated (by placement)
  entries.sort((a, b) => {
    const order = { champion: 0, active: 1, eliminated: 2 };
    const ao = order[a.status];
    const bo = order[b.status];
    if (ao !== bo) return ao - bo;
    if (a.status === 'eliminated' && b.status === 'eliminated') {
      return (a.placement ?? 999) - (b.placement ?? 999);
    }
    return a.team.id - b.team.id;
  });

  return { rounds, entries, current_round: currentRound };
}

// ---------------------------------------------------------------------------
// DB-backed MATCH_PLAY standings service
// ---------------------------------------------------------------------------

export async function getMatchPlayStandings(stageId: number): Promise<MatchPlayStandings | null> {
  // Verify stage exists
  const stageCheck = await pool.query<{ id: number }>(`SELECT id FROM event_stages WHERE id = $1`, [
    stageId,
  ]);
  if (stageCheck.rowCount === 0) return null;

  // Fetch all matches with game results
  const matchesResult = await pool.query<{
    id: number;
    round_number: number;
    team1_id: number;
    team2_id: number;
    status: string;
    winner_team_id: number | null;
  }>(
    `SELECT id, round_number, team1_id, team2_id, status, winner_team_id
     FROM event_matches
     WHERE stage_id = $1
     ORDER BY round_number, id`,
    [stageId],
  );

  if (matchesResult.rows.length === 0) {
    return { rounds: [], entries: [], current_round: null };
  }

  // Fetch all match game results
  const matchIds = matchesResult.rows.map((m) => m.id);
  const gameResultsResult = await pool.query<{
    match_id: number;
    id: number;
    game_index: number;
    team1_score: number | null;
    team2_score: number | null;
  }>(
    `SELECT id, match_id, game_index, team1_score, team2_score
     FROM event_match_game_results
     WHERE match_id = ANY($1)
     ORDER BY match_id, game_index`,
    [matchIds],
  );

  const gameResultsByMatch = new Map<number, MatchGameResult[]>();
  for (const gr of gameResultsResult.rows) {
    if (!gameResultsByMatch.has(gr.match_id)) gameResultsByMatch.set(gr.match_id, []);
    gameResultsByMatch.get(gr.match_id)!.push({
      id: gr.id,
      game_index: gr.game_index,
      team1_score: gr.team1_score,
      team2_score: gr.team2_score,
    });
  }

  // Collect team IDs and fetch members
  const allTeamIds = new Set<number>();
  for (const m of matchesResult.rows) {
    allTeamIds.add(m.team1_id);
    allTeamIds.add(m.team2_id);
  }

  const membersResult = await pool.query<{
    event_team_id: number;
    user_id: number;
    display_name: string;
  }>(
    `SELECT etm.event_team_id, etm.user_id, u.display_name
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1)
     ORDER BY u.display_name`,
    [Array.from(allTeamIds)],
  );

  const membersByTeam = new Map<number, LeaderboardMember[]>();
  for (const m of membersResult.rows) {
    if (!membersByTeam.has(m.event_team_id)) membersByTeam.set(m.event_team_id, []);
    membersByTeam.get(m.event_team_id)!.push({ user_id: m.user_id, display_name: m.display_name });
  }

  // Build team map with display names
  const teamMap = new Map<number, RawTeamData>();
  for (const teamId of allTeamIds) {
    const members = membersByTeam.get(teamId) ?? [];
    teamMap.set(teamId, {
      id: teamId,
      display_name: deriveTeamDisplayName(members),
      members,
    });
  }

  // Build raw match data
  const rawMatches: RawMatchData[] = matchesResult.rows.map((m) => ({
    id: m.id,
    round_number: m.round_number,
    team1_id: m.team1_id,
    team2_id: m.team2_id,
    status: m.status as 'PENDING' | 'IN_PROGRESS' | 'COMPLETE',
    winner_team_id: m.winner_team_id,
    game_results: gameResultsByMatch.get(m.id) ?? [],
  }));

  return computeMatchPlayStandings(rawMatches, teamMap);
}

// ---------------------------------------------------------------------------
// Group leaderboard (ADR 0005)
// ---------------------------------------------------------------------------

type GroupScoringConfig = {
  method?: 'sum' | 'best_of_n';
  n?: number;
  absent_score_policy?: 'null_as_zero' | 'exclude';
};

export type GroupStageScore = {
  stage_id: number;
  stage_label: string;
  score: number | null;
};

export type GroupLeaderboardEntry = {
  rank: number;
  team: {
    id: number;
    display_name: string;
    members: LeaderboardMember[];
  };
  group_score: number;
  stage_scores: GroupStageScore[];
};

export type GroupLeaderboard = {
  group_id: number;
  label: string;
  entries: GroupLeaderboardEntry[];
};

export async function getGroupLeaderboard(groupId: number): Promise<GroupLeaderboard | null> {
  const groupResult = await pool.query<{
    id: number;
    label: string;
    scoring_config_json: GroupScoringConfig;
  }>(`SELECT id, label, scoring_config_json FROM event_stage_groups WHERE id = $1`, [groupId]);
  if (groupResult.rowCount === 0) return null;

  const group = groupResult.rows[0];
  const config: GroupScoringConfig = group.scoring_config_json ?? {};
  const method = config.method ?? 'sum';
  const n = config.n ?? 0;
  const absentPolicy = config.absent_score_policy ?? 'null_as_zero';

  const stagesResult = await pool.query<{ id: number; label: string; mechanism: string }>(
    `SELECT id, label, mechanism FROM event_stages WHERE group_id = $1 ORDER BY stage_index`,
    [groupId],
  );
  if (stagesResult.rows.length === 0) {
    return { group_id: groupId, label: group.label, entries: [] };
  }

  // Collect per-team stage scores across all member stages
  type TeamAccum = {
    display_name: string;
    members: LeaderboardMember[];
    stage_scores: Map<number, number>;
  };
  const teamData = new Map<number, TeamAccum>();

  for (const stage of stagesResult.rows) {
    type Entry = {
      team_id: number;
      display_name: string;
      members: LeaderboardMember[];
      score: number;
    };
    const entries: Entry[] = [];

    if (stage.mechanism === 'SEEDED_LEADERBOARD') {
      const lb = await getSeededLeaderboard(stage.id);
      if (lb) {
        for (const e of lb.entries) {
          entries.push({
            team_id: e.team.id,
            display_name: e.team.display_name,
            members: e.team.members,
            score: e.stage_score,
          });
        }
      }
    } else if (stage.mechanism === 'GAUNTLET') {
      const lb = await getGauntletLeaderboard(stage.id);
      if (lb) {
        for (const e of lb.entries) {
          if (e.dnf || e.stage_score === null) continue;
          entries.push({
            team_id: e.team.id,
            display_name: e.team.display_name,
            members: e.team.members,
            score: e.stage_score,
          });
        }
      }
    }

    for (const e of entries) {
      if (!teamData.has(e.team_id)) {
        teamData.set(e.team_id, {
          display_name: e.display_name,
          members: e.members,
          stage_scores: new Map(),
        });
      }
      teamData.get(e.team_id)!.stage_scores.set(stage.id, e.score);
    }
  }

  if (teamData.size === 0) {
    return { group_id: groupId, label: group.label, entries: [] };
  }

  type Ranked = {
    team_id: number;
    display_name: string;
    members: LeaderboardMember[];
    group_score: number;
    stage_scores: GroupStageScore[];
  };
  const ranked: Ranked[] = [];

  for (const [teamId, data] of teamData) {
    const stageScoresList: GroupStageScore[] = [];
    const numericScores: number[] = [];

    for (const stage of stagesResult.rows) {
      const score = data.stage_scores.get(stage.id) ?? null;
      stageScoresList.push({ stage_id: stage.id, stage_label: stage.label, score });
      if (score !== null) {
        numericScores.push(score);
      } else if (absentPolicy === 'null_as_zero') {
        numericScores.push(0);
      }
      // absent_policy === 'exclude': absent stages are simply omitted
    }

    let groupScore = 0;
    if (method === 'sum') {
      groupScore = numericScores.reduce((acc, s) => acc + s, 0);
    } else if (method === 'best_of_n') {
      const sorted = [...numericScores].sort((a, b) => b - a);
      const take = n > 0 ? n : sorted.length;
      groupScore = sorted.slice(0, take).reduce((acc, s) => acc + s, 0);
    }

    ranked.push({
      team_id: teamId,
      display_name: data.display_name,
      members: data.members,
      group_score: groupScore,
      stage_scores: stageScoresList,
    });
  }

  ranked.sort((a, b) => b.group_score - a.group_score);

  const entries: GroupLeaderboardEntry[] = [];
  let rank = 1;
  for (let i = 0; i < ranked.length; i++) {
    if (i > 0 && ranked[i].group_score !== ranked[i - 1].group_score) {
      rank = i + 1;
    }
    const r = ranked[i];
    entries.push({
      rank,
      team: { id: r.team_id, display_name: r.display_name, members: r.members },
      group_score: r.group_score,
      stage_scores: r.stage_scores,
    });
  }

  return { group_id: groupId, label: group.label, entries };
}

// ---------------------------------------------------------------------------
// Aggregate event leaderboard types
// ---------------------------------------------------------------------------

type AggregateConfig = {
  method?: 'sum' | 'best_n_of_m' | 'rank_points';
  n?: number;
  points_map?: number[];
};

export type PlayerStageScore = {
  stage_id: number;
  stage_label: string;
  score: number; // raw stage score (or placement for MATCH_PLAY)
};

export type AggregateLeaderboardEntry = {
  rank: number;
  team: { id: number; display_name: string; members: { user_id: number; display_name: string }[] };
  total_score: number;
  stage_scores: PlayerStageScore[];
};

export type AggregateTrack = {
  team_size: number | null; // null = combined (all sizes together)
  entries: AggregateLeaderboardEntry[];
};

// ---------------------------------------------------------------------------
// Pure aggregate computation (exported for unit tests)
// ---------------------------------------------------------------------------

export type TeamContribution = {
  team_id: number;
  team_display_name: string;
  members: { user_id: number; display_name: string }[];
  contributions: { stage_id: number; stage_label: string; score: number; rank: number | null }[];
};

export function computeAggregateRankings(
  teams: TeamContribution[],
  config: AggregateConfig,
): AggregateLeaderboardEntry[] {
  const method = config.method ?? 'sum';
  const n = config.n ?? 0;
  const pointsMap = config.points_map ?? [];

  const withTotals: Array<{
    team_id: number;
    team_display_name: string;
    members: { user_id: number; display_name: string }[];
    total_score: number;
    stage_scores: PlayerStageScore[];
  }> = [];

  for (const team of teams) {
    const stageScores: PlayerStageScore[] = team.contributions.map((c) => ({
      stage_id: c.stage_id,
      stage_label: c.stage_label,
      score: c.score,
    }));

    let total = 0;

    if (method === 'sum') {
      total = stageScores.reduce((acc, s) => acc + s.score, 0);
    } else if (method === 'best_n_of_m') {
      const sorted = [...stageScores].sort((a, b) => b.score - a.score);
      total = sorted.slice(0, n).reduce((acc, s) => acc + s.score, 0);
    } else if (method === 'rank_points') {
      for (const c of team.contributions) {
        if (c.rank !== null && c.rank >= 1) {
          total += pointsMap[c.rank - 1] ?? 0;
        }
      }
    }

    withTotals.push({
      team_id: team.team_id,
      team_display_name: team.team_display_name,
      members: team.members,
      total_score: total,
      stage_scores: stageScores,
    });
  }

  // Exclude teams with no contributions
  const participants = withTotals.filter((t) => t.stage_scores.length > 0);

  // Sort by total_score descending
  const sorted = [...participants].sort((a, b) => b.total_score - a.total_score);

  // Assign ranks (tied teams get same rank)
  const entries: AggregateLeaderboardEntry[] = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].total_score !== sorted[i - 1].total_score) {
      rank = i + 1;
    }
    const t = sorted[i];
    entries.push({
      rank,
      team: { id: t.team_id, display_name: t.team_display_name, members: t.members },
      total_score: t.total_score,
      stage_scores: t.stage_scores,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// DB-backed aggregate service
// ---------------------------------------------------------------------------

export async function getEventAggregate(eventId: number): Promise<AggregateTrack[] | null> {
  // Get event + aggregate config
  const eventResult = await pool.query<{
    id: number;
    aggregate_config_json: AggregateConfig | null;
    combined_leaderboard: boolean;
  }>(`SELECT id, aggregate_config_json, combined_leaderboard FROM events WHERE id = $1`, [eventId]);
  if (eventResult.rowCount === 0) return null;

  const aggregateConfig: AggregateConfig = eventResult.rows[0].aggregate_config_json ?? {
    method: 'sum',
  };

  // Get all stages for this event
  const stagesResult = await pool.query<{
    id: number;
    label: string;
    mechanism: string;
  }>(`SELECT id, label, mechanism FROM event_stages WHERE event_id = $1 ORDER BY stage_index`, [
    eventId,
  ]);

  if (stagesResult.rows.length === 0) return [];

  const combinedLeaderboard = eventResult.rows[0].combined_leaderboard;

  // sizeMap: team_size (or null for MATCH_PLAY/combined) → teamMap keyed by team_id
  type ContributionEntry = {
    stage_id: number;
    stage_label: string;
    score: number;
    rank: number | null;
  };
  type TeamData = {
    display_name: string;
    members: { user_id: number; display_name: string }[];
    contributions: ContributionEntry[];
  };
  const sizeMap = new Map<number | null, Map<number, TeamData>>();

  function getOrCreateTeamMap(size: number | null): Map<number, TeamData> {
    if (!sizeMap.has(size)) sizeMap.set(size, new Map());
    return sizeMap.get(size)!;
  }

  function addTeamContribution(
    teamId: number,
    teamDisplayName: string,
    members: { user_id: number; display_name: string }[],
    stageId: number,
    stageLabel: string,
    score: number,
    rank: number | null,
    teamSize: number | null,
  ) {
    // For combined events, collapse all sizes into a single null track.
    // For per-size events, keep separate tracks per team_size.
    const key = combinedLeaderboard ? null : teamSize;
    const teamMap = getOrCreateTeamMap(key);
    if (!teamMap.has(teamId)) {
      teamMap.set(teamId, { display_name: teamDisplayName, members, contributions: [] });
    }
    teamMap
      .get(teamId)!
      .contributions.push({ stage_id: stageId, stage_label: stageLabel, score, rank });
  }

  for (const stage of stagesResult.rows) {
    if (stage.mechanism === 'SEEDED_LEADERBOARD') {
      const lb = await getSeededLeaderboard(stage.id);
      if (!lb) continue;

      // Fetch effective_max_score per game_index — uses the same variant hierarchy
      // as games.service (explicit override → game variant → stage variant → event variant).
      const maxScoreResult = await pool.query<{
        game_index: number;
        effective_max_score: number | null;
      }>(
        `SELECT esg.game_index,
                COALESCE(
                  esg.max_score,
                  CASE
                    WHEN esg.variant_id IS NOT NULL
                      THEN hv_g.num_suits * CASE WHEN hv_g.is_sudoku THEN hv_g.num_suits ELSE 5 END
                    WHEN es.variant_rule_json->>'type' = 'none'     THEN 25
                    WHEN es.variant_rule_json->>'type' = 'specific'
                      THEN hv_s.num_suits * CASE WHEN hv_s.is_sudoku THEN hv_s.num_suits ELSE 5 END
                    WHEN e.variant_rule_json->>'type' = 'none'      THEN 25
                    WHEN e.variant_rule_json->>'type' = 'specific'
                      THEN hv_e.num_suits * CASE WHEN hv_e.is_sudoku THEN hv_e.num_suits ELSE 5 END
                    ELSE 25
                  END
                ) AS effective_max_score
         FROM event_stage_games esg
         JOIN event_stages es ON es.id = esg.stage_id
         JOIN events e ON e.id = es.event_id
         LEFT JOIN hanabi_variants hv_g ON hv_g.code = esg.variant_id
         LEFT JOIN hanabi_variants hv_s ON hv_s.code = (
           CASE WHEN es.variant_rule_json->>'type' = 'none'     THEN 0
                WHEN es.variant_rule_json->>'type' = 'specific' THEN (es.variant_rule_json->>'variantId')::int
                ELSE NULL END
         )
         LEFT JOIN hanabi_variants hv_e ON hv_e.code = (
           CASE WHEN e.variant_rule_json->>'type' = 'none'      THEN 0
                WHEN e.variant_rule_json->>'type' = 'specific'  THEN (e.variant_rule_json->>'variantId')::int
                ELSE NULL END
         )
         WHERE esg.stage_id = $1`,
        [stage.id],
      );
      const maxScoreByIndex = new Map<number, number | null>();
      for (const row of maxScoreResult.rows) {
        maxScoreByIndex.set(row.game_index, row.effective_max_score);
      }

      for (const entry of lb.entries) {
        // score = count of games where the team hit the per-game max_score
        const countMax = entry.game_scores.filter((gs) => {
          const maxScore = maxScoreByIndex.get(gs.game_index);
          return maxScore != null && gs.score === maxScore;
        }).length;
        addTeamContribution(
          entry.team.id,
          entry.team.display_name,
          entry.team.members,
          stage.id,
          stage.label,
          countMax,
          entry.rank,
          entry.team_size,
        );
      }
    } else if (stage.mechanism === 'GAUNTLET') {
      const lb = await getGauntletLeaderboard(stage.id);
      if (!lb) continue;
      for (const entry of lb.entries) {
        if (entry.dnf) continue; // DNF teams score 0 for sum, not counted for best_n_of_m
        addTeamContribution(
          entry.team.id,
          entry.team.display_name,
          entry.team.members,
          stage.id,
          stage.label,
          entry.stage_score ?? 0,
          entry.rank,
          entry.team_size,
        );
      }
    } else if (stage.mechanism === 'MATCH_PLAY') {
      const standings = await getMatchPlayStandings(stage.id);
      if (!standings) continue;
      for (const entry of standings.entries) {
        if (entry.status === 'active') continue; // bracket not resolved yet
        // MATCH_PLAY has no per-size tracks; always collapses to null
        addTeamContribution(
          entry.team.id,
          entry.team.display_name,
          entry.team.members,
          stage.id,
          stage.label,
          entry.placement ?? 0,
          entry.placement,
          null,
        );
      }
    }
  }

  // Build sorted tracks: null (combined) first, then ascending team_size
  const sortedSizes = [...sizeMap.keys()].sort((a, b) => {
    if (a === null) return -1;
    if (b === null) return 1;
    return a - b;
  });

  return sortedSizes.map((size) => {
    const teamMap = sizeMap.get(size)!;
    const teams: TeamContribution[] = Array.from(teamMap.entries()).map(([teamId, data]) => ({
      team_id: teamId,
      team_display_name: data.display_name,
      members: data.members,
      contributions: data.contributions,
    }));
    return {
      team_size: size,
      entries: computeAggregateRankings(teams, aggregateConfig),
    };
  });
}
