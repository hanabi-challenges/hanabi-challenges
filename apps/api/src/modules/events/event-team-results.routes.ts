import { Router, type Response } from 'express';
import { authOptional, hasRole, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { pool } from '../../config/db';
import { getEventBySlug } from './events.service';
import { deriveTeamDisplayName } from '../../utils/team.utils';

// Mounted at /api/events/:slug/teams (mergeParams: true)
const router = Router({ mergeParams: true });

// GET /api/events/:slug/teams/:teamId — team info + per-stage game results
//
// Access control:
//   - Must be authenticated (401 if not)
//   - Admins/superadmins: always allowed
//   - Members of the viewed team: always allowed (they played the games)
//   - Players who have forfeited eligibility for this event: allowed
//   - Players whose same-sized team has results for all active game slots: allowed
//   - Otherwise: 403 { error: 'spoilers' }
//
// "Active" stages are those with starts_at <= NOW() or no start date set.
// Different team sizes play different seeds, so only same-sized teams are blocked.
// If the viewer has no same-sized team in this event they have no spoiler risk.
router.get('/:teamId', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const teamId = Number(req.params.teamId);
  if (!Number.isInteger(teamId) || teamId <= 0) {
    return res.status(400).json({ error: 'Invalid teamId' });
  }

  const isAdmin = hasRole(req.user, 'HOST');
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const teamResult = await pool.query<{ id: number; team_size: number }>(
    `SELECT id, team_size FROM event_teams WHERE id = $1 AND event_id = $2`,
    [teamId, event.id],
  );
  if ((teamResult.rowCount ?? 0) === 0) return res.status(404).json({ error: 'Team not found' });

  const teamSize = teamResult.rows[0].team_size;

  // ---------------------------------------------------------------------------
  // Access control
  // ---------------------------------------------------------------------------

  if (!isAdmin) {
    // Must be authenticated
    if (!req.user) {
      return res.status(401).json({ error: 'authentication_required' });
    }

    const userId = req.user.userId;

    // Members of the viewed team always have access
    const memberCheck = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM event_team_members
         WHERE event_team_id = $1 AND user_id = $2 AND confirmed = TRUE
       ) AS exists`,
      [teamId, userId],
    );
    const isMember = memberCheck.rows[0].exists;

    if (!isMember) {
      // Check forfeit
      const forfeitCheck = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM event_forfeitures WHERE event_id = $1 AND user_id = $2
         ) AS exists`,
        [event.id, userId],
      );

      if (!forfeitCheck.rows[0].exists) {
        // Check same-size completion of all active stage game slots
        const completionRes = await pool.query<{
          total_active: string;
          viewer_completed: string;
          same_size_team_count: string;
        }>(
          `WITH active_slots AS (
             SELECT esg.id
             FROM event_stage_games esg
             JOIN event_stages es ON es.id = esg.stage_id
             WHERE es.event_id = $1
               AND (es.starts_at IS NULL OR es.starts_at <= NOW())
           ),
           viewer_same_size_teams AS (
             SELECT et.id
             FROM event_teams et
             JOIN event_team_members etm ON etm.event_team_id = et.id
             WHERE et.event_id = $1
               AND et.team_size = $3
               AND etm.user_id = $2
               AND etm.confirmed = TRUE
           ),
           viewer_played AS (
             SELECT DISTINCT egr.stage_game_id AS id
             FROM event_game_results egr
             WHERE egr.event_team_id IN (SELECT id FROM viewer_same_size_teams)
               AND egr.attempt_id IS NULL
           )
           SELECT
             (SELECT COUNT(*) FROM active_slots)                                          AS total_active,
             (SELECT COUNT(*) FROM viewer_played WHERE id IN (SELECT id FROM active_slots)) AS viewer_completed,
             (SELECT COUNT(*) FROM viewer_same_size_teams)                                AS same_size_team_count`,
          [event.id, userId, teamSize],
        );

        const { total_active, viewer_completed, same_size_team_count } = completionRes.rows[0];
        const totalActive = Number(total_active);
        const viewerCompleted = Number(viewer_completed);
        const hasSameSizeTeam = Number(same_size_team_count) > 0;

        // No same-sized team → no spoiler risk → allow
        // No active slots yet → nothing to spoil → allow
        // Viewer has played all active slots → allow
        const canAccess = !hasSameSizeTeam || totalActive === 0 || viewerCompleted >= totalActive;

        if (!canAccess) {
          return res.status(403).json({ error: 'spoilers' });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Fetch and return data
  // ---------------------------------------------------------------------------

  const membersResult = await pool.query<{
    user_id: number;
    display_name: string;
    color_hex: string | null;
    text_color: string | null;
  }>(
    `SELECT etm.user_id, u.display_name, u.color_hex, u.text_color
     FROM event_team_members etm
     JOIN users u ON u.id = etm.user_id
     WHERE etm.event_team_id = $1
     ORDER BY u.display_name`,
    [teamId],
  );

  const resultsResult = await pool.query<{
    stage_id: number;
    stage_label: string;
    stage_index: number;
    stage_game_id: number;
    game_index: number;
    effective_seed: string | null;
    effective_variant_name: string | null;
    effective_max_score: number | null;
    score: number | null;
    bdr: number | null;
    strikes: number | null;
    turns_played: number | null;
    hanabi_live_game_id: number | null;
    played_at: string | null;
    zero_reason: string | null;
  }>(
    `SELECT
       es.id            AS stage_id,
       es.label         AS stage_label,
       es.stage_index,
       esg.id           AS stage_game_id,
       esg.game_index,
       -- Effective seed: game literal payload, then stage formula, then event formula
       CASE
         WHEN esg.seed_payload IS NOT NULL THEN esg.seed_payload
         WHEN es.seed_rule_json->>'formula' IS NOT NULL THEN
           REPLACE(REPLACE(REPLACE(
             es.seed_rule_json->>'formula',
             '{eID}', e.id::text),
             '{sID}', es.id::text),
             '{gID}', (esg.game_index + 1)::text)
         WHEN e.seed_rule_json->>'formula' IS NOT NULL THEN
           REPLACE(REPLACE(REPLACE(
             e.seed_rule_json->>'formula',
             '{eID}', e.id::text),
             '{sID}', es.id::text),
             '{gID}', (esg.game_index + 1)::text)
         ELSE NULL
       END AS effective_seed,
       -- Effective max score: explicit override, else derive from variant hierarchy
       COALESCE(
         esg.max_score,
         CASE
           WHEN esg.variant_id IS NOT NULL
             THEN hv_g.num_suits * CASE WHEN hv_g.is_sudoku THEN hv_g.num_suits ELSE 5 END
           WHEN es.variant_rule_json->>'type' = 'none'     THEN 5 * 5
           WHEN es.variant_rule_json->>'type' = 'specific'
             THEN hv_s.num_suits * CASE WHEN hv_s.is_sudoku THEN hv_s.num_suits ELSE 5 END
           WHEN e.variant_rule_json->>'type' = 'none'      THEN 5 * 5
           WHEN e.variant_rule_json->>'type' = 'specific'
             THEN hv_e.num_suits * CASE WHEN hv_e.is_sudoku THEN hv_e.num_suits ELSE 5 END
           ELSE 5 * 5
         END
       ) AS effective_max_score,
       -- Effective variant name for create-table links
       CASE
         WHEN esg.variant_id IS NOT NULL THEN hv_g.name
         WHEN es.variant_rule_json->>'type' = 'none' THEN 'No Variant'
         WHEN es.variant_rule_json->>'type' = 'specific' THEN hv_s.name
         WHEN e.variant_rule_json->>'type' = 'none' THEN 'No Variant'
         WHEN e.variant_rule_json->>'type' = 'specific' THEN hv_e.name
         ELSE 'No Variant'
       END AS effective_variant_name,
       egr.score,
       egr.bottom_deck_risk  AS bdr,
       egr.strikes,
       -- turns_played: only present when a result exists
       CASE WHEN egr.id IS NOT NULL THEN
         (SELECT COUNT(*)::int FROM jsonb_array_elements(hlge.actions) a
          WHERE (a->>'type')::int < 4)
       ELSE NULL END AS turns_played,
       egr.hanabi_live_game_id,
       COALESCE(hlge.datetime_finished, egr.played_at) AS played_at,
       egr.zero_reason
     FROM event_stage_games esg
     JOIN event_stages es ON es.id = esg.stage_id
     JOIN events e ON e.id = es.event_id
     LEFT JOIN event_game_results egr ON egr.stage_game_id = esg.id
       AND egr.event_team_id = $1 AND egr.attempt_id IS NULL
     LEFT JOIN hanabi_live_game_exports hlge ON hlge.game_id = egr.hanabi_live_game_id
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
     WHERE es.event_id = $2
     ORDER BY es.stage_index, esg.game_index`,
    [teamId, event.id],
  );

  type GameResult = {
    stage_game_id: number;
    game_index: number;
    effective_seed: string | null;
    effective_variant_name: string | null;
    effective_max_score: number | null;
    score: number | null;
    bdr: number | null;
    strikes: number | null;
    turns_played: number | null;
    hanabi_live_game_id: number | null;
    played_at: string | null;
    zero_reason: string | null;
  };
  type StageResults = { id: number; label: string; stage_index: number; games: GameResult[] };
  const stageMap = new Map<number, StageResults>();

  for (const row of resultsResult.rows) {
    if (!stageMap.has(row.stage_id)) {
      stageMap.set(row.stage_id, {
        id: row.stage_id,
        label: row.stage_label,
        stage_index: row.stage_index,
        games: [],
      });
    }
    stageMap.get(row.stage_id)!.games.push({
      stage_game_id: row.stage_game_id,
      game_index: row.game_index,
      effective_seed: row.effective_seed,
      effective_variant_name: row.effective_variant_name,
      effective_max_score: row.effective_max_score,
      score: row.score,
      bdr: row.bdr,
      strikes: row.strikes,
      turns_played: row.turns_played,
      hanabi_live_game_id: row.hanabi_live_game_id,
      played_at: row.played_at,
      zero_reason: row.zero_reason,
    });
  }

  const stages = [...stageMap.values()].sort((a, b) => a.stage_index - b.stage_index);
  const members = membersResult.rows;

  res.json({
    team: {
      id: teamResult.rows[0].id,
      display_name: deriveTeamDisplayName(members),
      team_size: teamResult.rows[0].team_size,
      members,
    },
    stages,
  });
});

export default router;
