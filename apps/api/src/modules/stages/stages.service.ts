import { pool } from '../../config/db';
import { resolveSeedPayload, resolveVariantId, VariantRule } from '../../utils/seed.utils';
import { inferStageStatus } from '../../utils/status.utils';
import type { StageRow, StageResponse, CreateStageBody, UpdateStageBody } from './stages.types';

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

type StageRowWithCounts = StageRow & { game_slot_count: string; team_count: string };

function formatStage(row: StageRowWithCounts): StageResponse {
  return {
    ...row,
    game_slot_count: parseInt(row.game_slot_count, 10),
    team_count: parseInt(row.team_count, 10),
    status: inferStageStatus(
      {
        time_policy: row.time_policy as 'WINDOW' | 'ROLLING' | 'SCHEDULED',
        starts_at: row.starts_at,
        ends_at: row.ends_at,
      },
      new Date(),
    ),
  };
}

const STAGE_SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM event_stage_games g WHERE g.stage_id = s.id)::text AS game_slot_count,
    (SELECT COUNT(*) FROM event_teams t
     WHERE (t.stage_id = s.id) OR (t.stage_id IS NULL AND t.event_id = s.event_id))::text AS team_count
  FROM event_stages s
`;

export async function listStages(eventId: number): Promise<StageResponse[]> {
  const result = await pool.query<StageRowWithCounts>(
    `${STAGE_SELECT} WHERE s.event_id = $1 ORDER BY s.stage_index`,
    [eventId],
  );
  return result.rows.map(formatStage);
}

export async function getStage(eventId: number, stageId: number): Promise<StageResponse | null> {
  const result = await pool.query<StageRowWithCounts>(
    `${STAGE_SELECT} WHERE s.id = $1 AND s.event_id = $2`,
    [stageId, eventId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return formatStage(result.rows[0]);
}

export async function createStage(eventId: number, body: CreateStageBody): Promise<StageResponse> {
  // stage_index = next after current max
  const indexResult = await pool.query<{ next_index: number }>(
    `SELECT COALESCE(MAX(stage_index), -1) + 1 AS next_index FROM event_stages WHERE event_id = $1`,
    [eventId],
  );
  const stageIndex = indexResult.rows[0].next_index;

  const result = await pool.query<StageRow>(
    `INSERT INTO event_stages (
       event_id, label, stage_index, mechanism, team_policy, team_scope,
       attempt_policy, time_policy, game_scoring_config_json,
       stage_scoring_config_json, variant_rule_json, seed_rule_json,
       config_json, starts_at, ends_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      eventId,
      body.label,
      stageIndex,
      body.mechanism,
      body.team_policy,
      body.team_scope,
      body.attempt_policy,
      body.time_policy,
      body.game_scoring_config_json ?? {},
      body.stage_scoring_config_json ?? {},
      body.variant_rule_json ?? null,
      body.seed_rule_json ?? null,
      body.config_json ?? {},
      body.starts_at ?? null,
      body.ends_at ?? null,
    ],
  );
  const newStage = await getStage(eventId, result.rows[0].id);
  return newStage!;
}

const UPDATABLE_FIELDS = [
  'label',
  'team_policy',
  'team_scope',
  'attempt_policy',
  'time_policy',
  'game_scoring_config_json',
  'stage_scoring_config_json',
  'variant_rule_json',
  'seed_rule_json',
  'config_json',
  'starts_at',
  'ends_at',
] as const;

export async function updateStage(
  eventId: number,
  stageId: number,
  body: UpdateStageBody,
): Promise<StageResponse | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = $${values.length + 1}`);
      values.push((body as Record<string, unknown>)[key] ?? null);
    }
  }

  if (fields.length > 0) {
    values.push(stageId, eventId);
    const result = await pool.query(
      `UPDATE event_stages SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND event_id = $${values.length}
       RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
  }

  return getStage(eventId, stageId);
}

// Reorder: moves stageId to newIndex, shifting other stages to make room.
// Uses a temporary negative index to avoid the UNIQUE (event_id, stage_index) constraint.
export async function reorderStage(
  eventId: number,
  stageId: number,
  newIndex: number,
): Promise<StageResponse | null> {
  const stageResult = await pool.query<{ stage_index: number }>(
    `SELECT stage_index FROM event_stages WHERE id = $1 AND event_id = $2`,
    [stageId, eventId],
  );
  if ((stageResult.rowCount ?? 0) === 0) return null;

  const oldIndex = stageResult.rows[0].stage_index;
  if (oldIndex === newIndex) return getStage(eventId, stageId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Park the target stage at a temporary negative index to free up its slot
    await client.query(`UPDATE event_stages SET stage_index = $1 WHERE id = $2`, [
      -stageId,
      stageId,
    ]);

    if (oldIndex < newIndex) {
      // Shift stages between (old+1) and new down by 1
      await client.query(
        `UPDATE event_stages
         SET stage_index = stage_index - 1
         WHERE event_id = $1 AND stage_index > $2 AND stage_index <= $3`,
        [eventId, oldIndex, newIndex],
      );
    } else {
      // Shift stages between new and (old-1) up by 1
      await client.query(
        `UPDATE event_stages
         SET stage_index = stage_index + 1
         WHERE event_id = $1 AND stage_index >= $2 AND stage_index < $3`,
        [eventId, newIndex, oldIndex],
      );
    }

    // Move target stage to its final position
    await client.query(`UPDATE event_stages SET stage_index = $1 WHERE id = $2`, [
      newIndex,
      stageId,
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getStage(eventId, stageId);
}

// Delete stage; returns false if game results exist for this stage.
export async function deleteStage(
  eventId: number,
  stageId: number,
): Promise<boolean | 'has_results'> {
  // Check for existing game results (via stage_games join)
  const resultCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_game_results egr
     JOIN event_stage_games esg ON esg.id = egr.stage_game_id
     WHERE esg.stage_id = $1`,
    [stageId],
  );
  if (parseInt(resultCheck.rows[0].count, 10) > 0) return 'has_results';

  const result = await pool.query(`DELETE FROM event_stages WHERE id = $1 AND event_id = $2`, [
    stageId,
    eventId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Propagation (T-010)
// ---------------------------------------------------------------------------

export type PropagateOptions = {
  overrideExisting?: boolean;
};

type StageWithRules = {
  id: number;
  event_id: number;
  variant_rule_json: VariantRule | null;
  seed_rule_json: { formula?: string } | null;
};

type EventRuleRow = {
  variant_rule_json: VariantRule | null;
  seed_rule_json: { formula?: string } | null;
};

type GameSlotRow = {
  id: number;
  game_index: number;
  team_size: number | null;
  variant_id: number | null;
  seed_payload: string | null;
};

export async function propagateToGameSlots(
  stageId: number,
  options: PropagateOptions = {},
): Promise<void> {
  const { overrideExisting = false } = options;

  const stageResult = await pool.query<StageWithRules>(
    `SELECT id, event_id, variant_rule_json, seed_rule_json
     FROM event_stages WHERE id = $1`,
    [stageId],
  );
  if (stageResult.rowCount === 0) return;
  const stage = stageResult.rows[0];

  const eventResult = await pool.query<EventRuleRow>(
    `SELECT variant_rule_json, seed_rule_json FROM events WHERE id = $1`,
    [stage.event_id],
  );
  const event = eventResult.rows[0] ?? { variant_rule_json: null, seed_rule_json: null };

  const slotsResult = await pool.query<GameSlotRow>(
    `SELECT id, game_index, team_size, variant_id, seed_payload
     FROM event_stage_games WHERE stage_id = $1`,
    [stageId],
  );

  for (const slot of slotsResult.rows) {
    const newVariantId = resolveVariantId(null, stage.variant_rule_json, event.variant_rule_json);
    const formula = stage.seed_rule_json?.formula ?? event.seed_rule_json?.formula ?? null;
    const newSeed = formula
      ? resolveSeedPayload(formula, {
          eventId: stage.event_id,
          stageId: stage.id,
          gameIndex: slot.game_index,
          teamSize: slot.team_size,
        })
      : null;

    const updateVariant = newVariantId !== null && (overrideExisting || slot.variant_id === null);
    const updateSeed = newSeed !== null && (overrideExisting || slot.seed_payload === null);

    if (!updateVariant && !updateSeed) continue;

    if (updateVariant && updateSeed) {
      await pool.query(
        `UPDATE event_stage_games SET variant_id = $1, seed_payload = $2 WHERE id = $3`,
        [newVariantId, newSeed, slot.id],
      );
    } else if (updateVariant) {
      await pool.query(`UPDATE event_stage_games SET variant_id = $1 WHERE id = $2`, [
        newVariantId,
        slot.id,
      ]);
    } else {
      await pool.query(`UPDATE event_stage_games SET seed_payload = $1 WHERE id = $2`, [
        newSeed,
        slot.id,
      ]);
    }
  }
}
