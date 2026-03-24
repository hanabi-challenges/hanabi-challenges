import { pool } from '../../config/db';
import {
  getSeededLeaderboard,
  getGauntletLeaderboard,
  getMatchPlayStandings,
  getGroupLeaderboard,
} from '../leaderboards/leaderboards.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BracketEntryRow = {
  id: number;
  stage_id: number;
  event_team_id: number;
  seed: number | null;
  created_at: Date;
};

export type BracketEntryWithTeam = BracketEntryRow & {
  team_display_name: string;
  team_size: number;
  member_names: string[];
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listBracketEntries(stageId: number): Promise<BracketEntryWithTeam[]> {
  const result = await pool.query<{
    id: number;
    stage_id: number;
    event_team_id: number;
    seed: number | null;
    created_at: Date;
    team_size: number;
  }>(
    `SELECT empe.*, et.team_size
     FROM event_match_play_entries empe
     JOIN event_teams et ON et.id = empe.event_team_id
     WHERE empe.stage_id = $1
     ORDER BY empe.seed NULLS LAST, empe.id`,
    [stageId],
  );

  if (result.rows.length === 0) return [];

  const teamIds = result.rows.map((r) => r.event_team_id);
  const membersResult = await pool.query<{ event_team_id: number; display_name: string }>(
    `SELECT etm.event_team_id, u.display_name
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = ANY($1) AND etm.confirmed = TRUE
     ORDER BY u.display_name`,
    [teamIds],
  );

  const membersByTeam = new Map<number, string[]>();
  for (const m of membersResult.rows) {
    if (!membersByTeam.has(m.event_team_id)) membersByTeam.set(m.event_team_id, []);
    membersByTeam.get(m.event_team_id)!.push(m.display_name);
  }

  return result.rows.map((r) => {
    const members = membersByTeam.get(r.event_team_id) ?? [];
    return {
      ...r,
      team_display_name: members.join(' / '),
      member_names: members,
    };
  });
}

export async function getBracketEntry(
  stageId: number,
  entryId: number,
): Promise<BracketEntryRow | null> {
  const result = await pool.query<BracketEntryRow>(
    `SELECT * FROM event_match_play_entries WHERE id = $1 AND stage_id = $2`,
    [entryId, stageId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Create (manual)
// ---------------------------------------------------------------------------

export type AddEntryResult =
  | { ok: true; entry: BracketEntryRow }
  | { ok: false; reason: 'team_not_in_event' | 'already_enrolled' };

export async function addBracketEntry(
  stageId: number,
  eventId: number,
  teamId: number,
  seed?: number | null,
): Promise<AddEntryResult> {
  // Validate team belongs to this event
  const teamCheck = await pool.query<{ id: number }>(
    `SELECT id FROM event_teams WHERE id = $1 AND event_id = $2`,
    [teamId, eventId],
  );
  if (teamCheck.rowCount === 0) return { ok: false, reason: 'team_not_in_event' };

  try {
    const result = await pool.query<BracketEntryRow>(
      `INSERT INTO event_match_play_entries (stage_id, event_team_id, seed)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [stageId, teamId, seed ?? null],
    );
    return { ok: true, entry: result.rows[0] };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === '23505') return { ok: false, reason: 'already_enrolled' };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export type DeleteEntryResult = 'ok' | 'not_found' | 'has_matches';

export async function deleteBracketEntry(
  stageId: number,
  entryId: number,
): Promise<DeleteEntryResult> {
  const entry = await getBracketEntry(stageId, entryId);
  if (!entry) return 'not_found';

  // Block if any matches reference this team on this stage
  const matchCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_matches
     WHERE stage_id = $1 AND (team1_id = $2 OR team2_id = $2)`,
    [stageId, entry.event_team_id],
  );
  if (parseInt(matchCheck.rows[0].count, 10) > 0) return 'has_matches';

  await pool.query(`DELETE FROM event_match_play_entries WHERE id = $1`, [entryId]);
  return 'ok';
}

// ---------------------------------------------------------------------------
// Qualify — auto-populate bracket entries from a stage transition
// ---------------------------------------------------------------------------

export type QualifyResult =
  | { ok: true; entries_created: number; entries: BracketEntryRow[] }
  | { ok: false; reason: 'no_transition' | 'already_has_entries' };

/**
 * Populate bracket entries for `stageId` by executing the transition
 * configured on the given source stage or group.
 *
 * Exactly one of `sourceStageId` or `sourceGroupId` must be provided.
 */
export async function qualifyBracketEntries(
  stageId: number,
  eventId: number,
  sourceStageId?: number,
  sourceGroupId?: number,
): Promise<QualifyResult> {
  // Block if entries already exist
  const existingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_match_play_entries WHERE stage_id = $1`,
    [stageId],
  );
  if (parseInt(existingCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'already_has_entries' };
  }

  // Load the transition from event_stage_transitions
  type TransitionRow = {
    filter_type: string;
    filter_value: number | null;
    seeding_method: string;
  };

  let transitionRow: TransitionRow | null = null;

  if (sourceStageId !== undefined) {
    const res = await pool.query<TransitionRow>(
      `SELECT filter_type, filter_value, seeding_method
       FROM event_stage_transitions
       WHERE event_id = $1 AND after_stage_id = $2`,
      [eventId, sourceStageId],
    );
    transitionRow = res.rows[0] ?? null;
  } else if (sourceGroupId !== undefined) {
    const res = await pool.query<TransitionRow>(
      `SELECT filter_type, filter_value, seeding_method
       FROM event_stage_transitions
       WHERE event_id = $1 AND after_group_id = $2`,
      [eventId, sourceGroupId],
    );
    transitionRow = res.rows[0] ?? null;
  }

  if (!transitionRow) return { ok: false, reason: 'no_transition' };

  const { filter_type, filter_value, seeding_method } = transitionRow;

  // Get ranked teams from the source
  const ranked =
    sourceStageId !== undefined
      ? await getStageQualifyingTeams(sourceStageId, filter_type, filter_value)
      : await getGroupQualifyingTeams(sourceGroupId!, filter_type, filter_value);

  if (ranked.length === 0) {
    return { ok: true, entries_created: 0, entries: [] };
  }

  // Apply seeding method
  let seededTeams: { teamId: number; seed: number | null }[];

  if (seeding_method === 'RANKED') {
    const sorted = [...ranked].sort((a, b) => a.rank - b.rank);
    seededTeams = sorted.map(({ teamId }, i) => ({ teamId, seed: i + 1 }));
  } else if (seeding_method === 'RANDOM') {
    const shuffled = [...ranked].sort(() => Math.random() - 0.5);
    seededTeams = shuffled.map(({ teamId }, i) => ({ teamId, seed: i + 1 }));
  } else {
    // PRESERVE or MANUAL: keep source rank as seed, no re-numbering
    seededTeams = ranked.map(({ teamId, rank }) => ({
      teamId,
      seed: seeding_method === 'PRESERVE' ? rank : null,
    }));
  }

  const newEntries: BracketEntryRow[] = [];
  for (const { teamId, seed } of seededTeams) {
    const result = await pool.query<BracketEntryRow>(
      `INSERT INTO event_match_play_entries (stage_id, event_team_id, seed)
       VALUES ($1, $2, $3)
       ON CONFLICT (stage_id, event_team_id) DO NOTHING
       RETURNING *`,
      [stageId, teamId, seed],
    );
    if (result.rows.length > 0) newEntries.push(result.rows[0]);
  }

  return { ok: true, entries_created: newEntries.length, entries: newEntries };
}

// ---------------------------------------------------------------------------
// Internal: get qualifying teams from a single source stage
// ---------------------------------------------------------------------------

async function getStageQualifyingTeams(
  sourceStageId: number,
  filterType: string,
  filterValue: number | null,
): Promise<{ teamId: number; rank: number; score: number }[]> {
  const stageRes = await pool.query<{ mechanism: string }>(
    `SELECT mechanism FROM event_stages WHERE id = $1`,
    [sourceStageId],
  );
  if (stageRes.rowCount === 0) return [];
  const { mechanism } = stageRes.rows[0];

  const allRanked: { teamId: number; rank: number; score: number }[] = [];

  if (mechanism === 'SEEDED_LEADERBOARD') {
    const lb = await getSeededLeaderboard(sourceStageId);
    if (!lb) return [];
    for (const e of lb.entries) {
      allRanked.push({ teamId: e.team.id, rank: e.rank, score: e.stage_score });
    }
  } else if (mechanism === 'GAUNTLET') {
    const lb = await getGauntletLeaderboard(sourceStageId);
    if (!lb) return [];
    for (const e of lb.entries) {
      if (!e.dnf && e.rank !== null && e.stage_score !== null) {
        allRanked.push({ teamId: e.team.id, rank: e.rank, score: e.stage_score });
      }
    }
  } else if (mechanism === 'MATCH_PLAY') {
    const standings = await getMatchPlayStandings(sourceStageId);
    if (!standings) return [];
    for (const e of standings.entries) {
      if (e.placement !== null) {
        allRanked.push({ teamId: e.team.id, rank: e.placement, score: 0 });
      }
    }
  }

  return applyFilter(allRanked, filterType, filterValue);
}

// ---------------------------------------------------------------------------
// Internal: get qualifying teams from a stage group aggregate leaderboard
// ---------------------------------------------------------------------------

async function getGroupQualifyingTeams(
  groupId: number,
  filterType: string,
  filterValue: number | null,
): Promise<{ teamId: number; rank: number; score: number }[]> {
  const lb = await getGroupLeaderboard(groupId);
  if (!lb) return [];

  const allRanked = lb.entries.map((e) => ({
    teamId: e.team.id,
    rank: e.rank,
    score: e.group_score,
  }));

  return applyFilter(allRanked, filterType, filterValue);
}

// ---------------------------------------------------------------------------
// Internal: apply filter (TOP_N / THRESHOLD / ALL / MANUAL)
// ---------------------------------------------------------------------------

function applyFilter(
  allRanked: { teamId: number; rank: number; score: number }[],
  filterType: string,
  filterValue: number | null,
): { teamId: number; rank: number; score: number }[] {
  if (filterType === 'ALL') return allRanked;
  if (filterType === 'TOP_N' && filterValue !== null) {
    return allRanked.filter((t) => t.rank <= filterValue);
  }
  if (filterType === 'THRESHOLD' && filterValue !== null) {
    return allRanked.filter((t) => t.score >= filterValue);
  }
  // MANUAL — admin adds entries manually; return nothing from automation
  return [];
}
