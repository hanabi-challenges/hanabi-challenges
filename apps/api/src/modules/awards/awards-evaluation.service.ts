import { pool } from '../../config/db';
import {
  getSeededLeaderboard,
  getGauntletLeaderboard,
  getMatchPlayStandings,
} from '../leaderboards/leaderboards.service';
import type { AwardRow, CriteriaType } from './awards.service';
import { createAwardGrantedNotification } from '../notifications/notifications.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrantRow = {
  id: number;
  award_id: number;
  user_id: number;
  event_team_id: number | null;
  granted_at: Date;
};

type QualifyingGrant = {
  award_id: number;
  user_id: number;
  event_team_id: number | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getStageMechanism(stageId: number): Promise<string | null> {
  const res = await pool.query<{ mechanism: string }>(
    `SELECT mechanism FROM event_stages WHERE id = $1`,
    [stageId],
  );
  return res.rows[0]?.mechanism ?? null;
}

async function getStageMaxScore(stageId: number): Promise<number> {
  const res = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(max_score), 0) AS total FROM event_stage_games WHERE stage_id = $1`,
    [stageId],
  );
  return Number(res.rows[0]?.total ?? 0);
}

type TeamGrant = { teamId: number; userIds: number[] };

/**
 * Collect qualifying teams for a RANK_POSITION or SCORE_THRESHOLD award on a stage.
 */
async function collectStageQualifiers(award: AwardRow, stageId: number): Promise<TeamGrant[]> {
  const mechanism = await getStageMechanism(stageId);
  if (!mechanism) return [];

  const criteriaValue = award.criteria_value as Record<string, unknown> | null;
  const teamSizeFilter = award.team_size ?? null;

  if (mechanism === 'SEEDED_LEADERBOARD') {
    const lb = await getSeededLeaderboard(stageId);
    if (!lb) return [];

    let entries = lb.entries;
    if (teamSizeFilter !== null) {
      entries = entries.filter((e) => e.team_size === teamSizeFilter);
    }

    const qualifying: TeamGrant[] = [];

    if (award.criteria_type === 'RANK_POSITION') {
      const positions = (criteriaValue?.positions ?? []) as number[];
      for (const e of entries) {
        if (positions.includes(e.rank)) {
          qualifying.push({ teamId: e.team.id, userIds: e.team.members.map((m) => m.user_id) });
        }
      }
    } else if (award.criteria_type === 'SCORE_THRESHOLD') {
      const minScore = criteriaValue?.min_score as number | undefined;
      const minPct = criteriaValue?.min_percentage as number | undefined;
      let threshold: number | null = null;
      if (minScore !== undefined) {
        threshold = minScore;
      } else if (minPct !== undefined) {
        const maxScore = await getStageMaxScore(stageId);
        threshold = maxScore * minPct;
      }
      if (threshold !== null) {
        for (const e of entries) {
          if (e.stage_score >= threshold) {
            qualifying.push({ teamId: e.team.id, userIds: e.team.members.map((m) => m.user_id) });
          }
        }
      }
    }

    return qualifying;
  }

  if (mechanism === 'GAUNTLET') {
    const lb = await getGauntletLeaderboard(stageId);
    if (!lb) return [];

    // Only ranked entries (non-DNF) have a score
    let entries = lb.entries.filter((e) => !e.dnf);
    if (teamSizeFilter !== null) {
      entries = entries.filter((e) => e.team_size === teamSizeFilter);
    }

    const qualifying: TeamGrant[] = [];

    if (award.criteria_type === 'RANK_POSITION') {
      const positions = (criteriaValue?.positions ?? []) as number[];
      for (const e of entries) {
        if (e.rank !== null && positions.includes(e.rank)) {
          qualifying.push({ teamId: e.team.id, userIds: e.team.members.map((m) => m.user_id) });
        }
      }
    } else if (award.criteria_type === 'SCORE_THRESHOLD') {
      const minScore = criteriaValue?.min_score as number | undefined;
      const minPct = criteriaValue?.min_percentage as number | undefined;
      let threshold: number | null = null;
      if (minScore !== undefined) {
        threshold = minScore;
      } else if (minPct !== undefined) {
        const maxScore = await getStageMaxScore(stageId);
        threshold = maxScore * minPct;
      }
      if (threshold !== null) {
        for (const e of entries) {
          if (e.stage_score !== null && e.stage_score >= threshold) {
            qualifying.push({ teamId: e.team.id, userIds: e.team.members.map((m) => m.user_id) });
          }
        }
      }
    }

    return qualifying;
  }

  if (mechanism === 'MATCH_PLAY') {
    const standings = await getMatchPlayStandings(stageId);
    if (!standings) return [];

    let entries = standings.entries;
    if (teamSizeFilter !== null) {
      entries = entries.filter((e) => e.team.members.length === teamSizeFilter);
    }

    const qualifying: TeamGrant[] = [];

    if (award.criteria_type === 'RANK_POSITION') {
      const positions = (criteriaValue?.positions ?? []) as number[];
      for (const e of entries) {
        if (e.placement !== null && positions.includes(e.placement)) {
          qualifying.push({ teamId: e.team.id, userIds: e.team.members.map((m) => m.user_id) });
        }
      }
    }
    // SCORE_THRESHOLD is not meaningful for MATCH_PLAY — skip

    return qualifying;
  }

  return [];
}

/**
 * Collect qualifying users for a PARTICIPATION award (event-level).
 */
async function collectParticipationQualifiers(
  award: AwardRow,
  eventId: number,
): Promise<{ userId: number }[]> {
  const criteriaValue = award.criteria_value as Record<string, unknown> | null;
  const minStages = (criteriaValue?.min_stages ?? 0) as number;

  // Count distinct stages per user where their team submitted at least one result
  const res = await pool.query<{ user_id: number; stage_count: string }>(
    `SELECT etm.user_id, COUNT(DISTINCT esg.stage_id) AS stage_count
     FROM event_team_members etm
     JOIN event_teams et ON et.id = etm.event_team_id
     JOIN event_game_results egr ON egr.event_team_id = et.id
     JOIN event_stage_games esg ON esg.id = egr.stage_game_id
     WHERE et.event_id = $1
     GROUP BY etm.user_id
     HAVING COUNT(DISTINCT esg.stage_id) >= $2`,
    [eventId, minStages],
  );

  return res.rows.map((r) => ({ userId: r.user_id }));
}

// ---------------------------------------------------------------------------
// Main evaluation function
// ---------------------------------------------------------------------------

/**
 * Evaluate awards for an event (or a specific stage).
 * Idempotent — uses INSERT ... ON CONFLICT DO NOTHING.
 * Returns newly inserted grant rows.
 */
export async function evaluateAwards(eventId: number, stageId?: number): Promise<GrantRow[]> {
  // Load awards to evaluate
  let awardsQuery: string;
  let awardsParams: unknown[];

  if (stageId !== undefined) {
    // Evaluate awards tied to this specific stage
    awardsQuery = `SELECT * FROM event_awards WHERE event_id = $1 AND stage_id = $2 AND criteria_type != 'MANUAL'`;
    awardsParams = [eventId, stageId];
  } else {
    // Evaluate event-level awards (no stage)
    awardsQuery = `SELECT * FROM event_awards WHERE event_id = $1 AND stage_id IS NULL AND criteria_type != 'MANUAL'`;
    awardsParams = [eventId];
  }

  const awardsResult = await pool.query<AwardRow>(awardsQuery, awardsParams);
  if (awardsResult.rows.length === 0) return [];

  const pending: QualifyingGrant[] = [];

  for (const award of awardsResult.rows) {
    const type = award.criteria_type as CriteriaType;

    if (type === 'RANK_POSITION' || type === 'SCORE_THRESHOLD') {
      if (!award.stage_id) continue; // These require a stage

      const qualifiers = await collectStageQualifiers(award, award.stage_id);
      for (const q of qualifiers) {
        for (const userId of q.userIds) {
          pending.push({ award_id: award.id, user_id: userId, event_team_id: q.teamId });
        }
      }
    } else if (type === 'PARTICIPATION') {
      const qualifiers = await collectParticipationQualifiers(award, eventId);
      for (const q of qualifiers) {
        pending.push({ award_id: award.id, user_id: q.userId, event_team_id: null });
      }
    }
    // MANUAL: skip — filtered out above but guard here just in case
  }

  if (pending.length === 0) return [];

  // Fetch event name and slug for notifications
  const eventResult = await pool.query<{ name: string; slug: string }>(
    `SELECT name, slug FROM events WHERE id = $1`,
    [eventId],
  );
  const eventName = eventResult.rows[0]?.name ?? '';
  const eventSlug = eventResult.rows[0]?.slug ?? '';

  // Build award lookup for notification messages
  const awardIds = [...new Set(pending.map((g) => g.award_id))];
  const awardResult = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM event_awards WHERE id = ANY($1)`,
    [awardIds],
  );
  const awardNameMap = new Map(awardResult.rows.map((r) => [r.id, r.name]));

  // Bulk insert with ON CONFLICT DO NOTHING for idempotency
  const newGrants: GrantRow[] = [];
  for (const g of pending) {
    const res = await pool.query<GrantRow>(
      `INSERT INTO event_award_grants (award_id, user_id, event_team_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (award_id, user_id) DO NOTHING
       RETURNING *`,
      [g.award_id, g.user_id, g.event_team_id],
    );
    if (res.rows.length > 0) {
      newGrants.push(res.rows[0]);
      // Send notification for new grant
      const awardName = awardNameMap.get(g.award_id) ?? 'Award';
      await createAwardGrantedNotification(
        g.user_id,
        awardName,
        eventName,
        eventSlug,
        g.award_id,
      ).catch(() => {
        // Notification failure should not fail the grant
      });
    }
  }

  return newGrants;
}

// ---------------------------------------------------------------------------
// Grant read helpers (used by T-034 API)
// ---------------------------------------------------------------------------

export async function listGrantsForAward(awardId: number): Promise<GrantRow[]> {
  const res = await pool.query<GrantRow>(
    `SELECT * FROM event_award_grants WHERE award_id = $1 ORDER BY granted_at`,
    [awardId],
  );
  return res.rows;
}

export async function listMyGrants(eventId: number, userId: number): Promise<GrantRow[]> {
  const res = await pool.query<GrantRow>(
    `SELECT eag.* FROM event_award_grants eag
     JOIN event_awards ea ON ea.id = eag.award_id
     WHERE ea.event_id = $1 AND eag.user_id = $2
     ORDER BY eag.granted_at`,
    [eventId, userId],
  );
  return res.rows;
}

export async function createManualGrant(
  awardId: number,
  userId: number,
  eventTeamId: number | null,
): Promise<GrantRow | null> {
  const res = await pool.query<GrantRow>(
    `INSERT INTO event_award_grants (award_id, user_id, event_team_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (award_id, user_id) DO NOTHING
     RETURNING *`,
    [awardId, userId, eventTeamId],
  );
  return res.rows[0] ?? null; // null = already exists
}

export async function revokeGrant(grantId: number): Promise<boolean> {
  const res = await pool.query(`DELETE FROM event_award_grants WHERE id = $1`, [grantId]);
  return (res.rowCount ?? 0) > 0;
}
