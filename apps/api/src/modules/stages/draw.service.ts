import { pool } from '../../config/db';
import { attachMembers } from '../registrations/teams.service';
import type { TeamResponse, TeamRow } from '../registrations/teams.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamProposal = {
  user_ids: number[];
  display_names: string[];
  kind: 'CONFIRMED_PAIR' | 'PROPOSED_PAIR' | 'PROPOSED_TRIO';
};

export type DrawProposal = {
  teams: TeamProposal[];
  unmatched: Array<{ user_id: number; display_name: string }>;
};

type OptInRecord = {
  user_id: number;
  display_name: string;
  partner_user_id: number | null;
};

// ---------------------------------------------------------------------------
// Draw algorithm (T-048 stub)
// ---------------------------------------------------------------------------

/**
 * Pure function — no DB writes.
 * Rules:
 *   1. Confirmed pairs: A→B and B→A both opted in pointing at each other.
 *   2. Remaining players (solo queue + one-sided partner requests) are sorted
 *      alphabetically by display_name for determinism, then paired sequentially.
 *   3. If the solo pool has an odd count:
 *        - allowedTeamSizes includes 3 → last 3 become a trio
 *        - otherwise → last player is unmatched
 */
export function runQueuedDraw(optIns: OptInRecord[], allowedTeamSizes: number[]): DrawProposal {
  const teams: TeamProposal[] = [];
  const unmatched: Array<{ user_id: number; display_name: string }> = [];

  // Build a lookup: user_id → opt-in record
  const byUser = new Map<number, OptInRecord>();
  for (const o of optIns) byUser.set(o.user_id, o);

  // Step 1 — find confirmed pairs (mutual references)
  const paired = new Set<number>();

  for (const o of optIns) {
    if (paired.has(o.user_id)) continue;
    if (o.partner_user_id === null) continue;

    const partner = byUser.get(o.partner_user_id);
    if (!partner) continue;
    if (partner.partner_user_id !== o.user_id) continue;
    if (paired.has(partner.user_id)) continue;

    paired.add(o.user_id);
    paired.add(partner.user_id);

    const [a, b] = [o, partner].sort((x, y) =>
      x.display_name.localeCompare(y.display_name, undefined, { sensitivity: 'base' }),
    );
    teams.push({
      user_ids: [a.user_id, b.user_id],
      display_names: [a.display_name, b.display_name],
      kind: 'CONFIRMED_PAIR',
    });
  }

  // Step 2 — solo pool: everyone not yet paired, shuffled randomly
  const soloPool = optIns.filter((o) => !paired.has(o.user_id));
  // Fisher-Yates shuffle
  for (let k = soloPool.length - 1; k > 0; k--) {
    const j = Math.floor(Math.random() * (k + 1));
    [soloPool[k], soloPool[j]] = [soloPool[j], soloPool[k]];
  }

  // Step 3 — pair up solos; handle odd count
  let i = 0;
  const allowsTrio = allowedTeamSizes.includes(3);

  // If odd and trios are allowed, handle the last 3 as a trio
  const handleLastThreeAsTrio = allowsTrio && soloPool.length % 2 === 1 && soloPool.length >= 3;
  const pairLimit = handleLastThreeAsTrio
    ? soloPool.length - 3
    : soloPool.length - (soloPool.length % 2); // ensure even so the loop never reads undefined

  while (i < pairLimit) {
    const members = [soloPool[i], soloPool[i + 1]].sort((x, y) =>
      x.display_name.localeCompare(y.display_name, undefined, { sensitivity: 'base' }),
    );
    teams.push({
      user_ids: members.map((m) => m.user_id),
      display_names: members.map((m) => m.display_name),
      kind: 'PROPOSED_PAIR',
    });
    i += 2;
  }

  if (handleLastThreeAsTrio) {
    const members = [
      soloPool[soloPool.length - 3],
      soloPool[soloPool.length - 2],
      soloPool[soloPool.length - 1],
    ].sort((x, y) =>
      x.display_name.localeCompare(y.display_name, undefined, { sensitivity: 'base' }),
    );
    teams.push({
      user_ids: members.map((m) => m.user_id),
      display_names: members.map((m) => m.display_name),
      kind: 'PROPOSED_TRIO',
    });
  } else if (i < soloPool.length) {
    // Remaining odd-one-out
    const leftover = soloPool[i];
    unmatched.push({ user_id: leftover.user_id, display_name: leftover.display_name });
  }

  return { teams, unmatched };
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getOptInsWithNames(stageId: number): Promise<OptInRecord[]> {
  const result = await pool.query<OptInRecord>(
    `SELECT o.user_id, u.display_name, o.partner_user_id
     FROM event_stage_opt_ins o
     JOIN users u ON u.id = o.user_id
     WHERE o.stage_id = $1`,
    [stageId],
  );
  return result.rows;
}

async function queuedTeamsExist(stageId: number): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_teams WHERE stage_id = $1 AND source = 'QUEUED'`,
    [stageId],
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

async function queuedTeamsHaveResults(stageId: number): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_game_results egr
     JOIN event_teams et ON et.id = egr.event_team_id
     WHERE et.stage_id = $1 AND et.source = 'QUEUED'`,
    [stageId],
  );
  return parseInt(result.rows[0].count, 10) > 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type PreviewDrawResult =
  | { ok: true; proposal: DrawProposal }
  | { ok: false; reason: 'wrong_stage_policy' | 'teams_already_exist' };

export async function previewDraw(
  stageId: number,
  allowedTeamSizes: number[],
): Promise<PreviewDrawResult> {
  // Stage must be QUEUED
  const stageCheck = await pool.query<{ team_policy: string }>(
    `SELECT team_policy FROM event_stages WHERE id = $1`,
    [stageId],
  );
  if (stageCheck.rowCount === 0 || stageCheck.rows[0].team_policy !== 'QUEUED') {
    return { ok: false, reason: 'wrong_stage_policy' };
  }

  if (await queuedTeamsExist(stageId)) {
    return { ok: false, reason: 'teams_already_exist' };
  }

  const optIns = await getOptInsWithNames(stageId);
  const proposal = runQueuedDraw(optIns, allowedTeamSizes);
  return { ok: true, proposal };
}

export type ConfirmDrawResult =
  | { ok: true; teams: TeamResponse[] }
  | { ok: false; reason: 'wrong_stage_policy' | 'teams_already_exist' };

export async function confirmDraw(
  eventId: number,
  stageId: number,
  allowedTeamSizes: number[],
): Promise<ConfirmDrawResult> {
  // Stage must be QUEUED
  const stageCheck = await pool.query<{ team_policy: string }>(
    `SELECT team_policy FROM event_stages WHERE id = $1`,
    [stageId],
  );
  if (stageCheck.rowCount === 0 || stageCheck.rows[0].team_policy !== 'QUEUED') {
    return { ok: false, reason: 'wrong_stage_policy' };
  }

  if (await queuedTeamsExist(stageId)) {
    return { ok: false, reason: 'teams_already_exist' };
  }

  const optIns = await getOptInsWithNames(stageId);
  const proposal = runQueuedDraw(optIns, allowedTeamSizes);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const teamIds: number[] = [];

    for (const t of proposal.teams) {
      const teamResult = await client.query<{ id: number }>(
        `INSERT INTO event_teams (event_id, stage_id, team_size, source)
         VALUES ($1, $2, $3, 'QUEUED')
         RETURNING id`,
        [eventId, stageId, t.user_ids.length],
      );
      const teamId = teamResult.rows[0].id;
      teamIds.push(teamId);

      for (const uid of t.user_ids) {
        await client.query(
          `INSERT INTO event_team_members (event_team_id, user_id, confirmed) VALUES ($1, $2, TRUE)`,
          [teamId, uid],
        );
      }
    }

    await client.query('COMMIT');

    // Fetch and return full team responses
    if (teamIds.length === 0) {
      return { ok: true, teams: [] };
    }
    const teamsResult = await pool.query<TeamRow>(
      `SELECT * FROM event_teams WHERE id = ANY($1) ORDER BY id`,
      [teamIds],
    );
    const teams = await attachMembers(teamsResult.rows);
    return { ok: true, teams };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export type ResetDrawResult =
  | { ok: true; deleted_count: number }
  | { ok: false; reason: 'has_results' | 'wrong_stage_policy' };

export async function resetDraw(stageId: number): Promise<ResetDrawResult> {
  // Stage must be QUEUED
  const stageCheck = await pool.query<{ team_policy: string }>(
    `SELECT team_policy FROM event_stages WHERE id = $1`,
    [stageId],
  );
  if (stageCheck.rowCount === 0 || stageCheck.rows[0].team_policy !== 'QUEUED') {
    return { ok: false, reason: 'wrong_stage_policy' };
  }

  if (await queuedTeamsHaveResults(stageId)) {
    return { ok: false, reason: 'has_results' };
  }

  const result = await pool.query(
    `DELETE FROM event_teams WHERE stage_id = $1 AND source = 'QUEUED'`,
    [stageId],
  );
  return { ok: true, deleted_count: result.rowCount ?? 0 };
}
