import { pool } from '../../config/db';
import {
  getSeededLeaderboard,
  getGauntletLeaderboard,
  getMatchPlayStandings,
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
// Qualify — auto-populate from stage relationships
// ---------------------------------------------------------------------------

export type QualifyResult =
  | { ok: true; entries_created: number; entries: BracketEntryRow[] }
  | { ok: false; reason: 'no_relationship' | 'already_has_entries' };

export async function qualifyBracketEntries(
  stageId: number,
  eventId: number,
): Promise<QualifyResult> {
  // Block if entries already exist
  const existingCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_match_play_entries WHERE stage_id = $1`,
    [stageId],
  );
  if (parseInt(existingCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'already_has_entries' };
  }

  // Load relationships targeting this stage
  const relResult = await pool.query<{
    id: number;
    source_stage_id: number;
    filter_type: string;
    filter_value: number | null;
    seeding_method: string;
  }>(
    `SELECT esr.id, esr.source_stage_id, esr.filter_type, esr.filter_value, esr.seeding_method
     FROM event_stage_relationships esr
     JOIN event_stages es ON es.id = esr.source_stage_id
     WHERE esr.target_stage_id = $1 AND es.event_id = $2`,
    [stageId, eventId],
  );

  if (relResult.rows.length === 0) return { ok: false, reason: 'no_relationship' };

  // Collect qualifying teams from all relationships (deduped)
  // Each { teamId, rank } — rank determines seed for RANKED seeding
  const qualifiedMap = new Map<number, number>(); // teamId → rank

  for (const rel of relResult.rows) {
    const ranked = await getQualifyingTeams(rel.source_stage_id, rel.filter_type, rel.filter_value);

    for (const { teamId, rank } of ranked) {
      if (!qualifiedMap.has(teamId)) {
        qualifiedMap.set(teamId, rank);
      }
    }
  }

  if (qualifiedMap.size === 0) {
    return { ok: true, entries_created: 0, entries: [] };
  }

  // Sort by rank for RANKED seeding (use first relationship's seeding_method)
  const seedingMethod = relResult.rows[0].seeding_method;
  const teams = Array.from(qualifiedMap.entries()); // [teamId, rank]

  let seededTeams: { teamId: number; seed: number | null }[];

  if (seedingMethod === 'RANKED') {
    const sorted = teams.sort((a, b) => a[1] - b[1]);
    seededTeams = sorted.map(([teamId], i) => ({ teamId, seed: i + 1 }));
  } else if (seedingMethod === 'RANDOM') {
    const shuffled = teams.sort(() => Math.random() - 0.5);
    seededTeams = shuffled.map(([teamId], i) => ({ teamId, seed: i + 1 }));
  } else {
    // MANUAL: no auto-seed
    seededTeams = teams.map(([teamId]) => ({ teamId, seed: null }));
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
// Internal: get qualifying teams from a source stage
// ---------------------------------------------------------------------------

async function getQualifyingTeams(
  sourceStageId: number,
  filterType: string,
  filterValue: number | null,
): Promise<{ teamId: number; rank: number }[]> {
  // Determine mechanism
  const stageRes = await pool.query<{ mechanism: string }>(
    `SELECT mechanism FROM event_stages WHERE id = $1`,
    [sourceStageId],
  );
  if (stageRes.rowCount === 0) return [];
  const { mechanism } = stageRes.rows[0];

  // Get ranked teams from the appropriate leaderboard
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

  if (filterType === 'ALL') return allRanked;

  if (filterType === 'TOP_N' && filterValue !== null) {
    return allRanked.filter((t) => t.rank <= filterValue);
  }

  if (filterType === 'THRESHOLD' && filterValue !== null) {
    return allRanked.filter((t) => t.score >= filterValue);
  }

  // MANUAL — return empty (admin adds manually)
  return [];
}
