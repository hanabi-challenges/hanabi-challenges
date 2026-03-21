import { pool } from '../../config/db';
import { resolveSeedPayload, resolveVariantId, type VariantRule } from '../../utils/seed.utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameSlot = {
  id: number;
  stage_id: number;
  game_index: number;
  nickname: string | null;
  variant_id: number | null; // null = inherit from stage/event
  seed_payload: string | null; // null = inherit formula from stage/event
  result_count: number;
  effective_variant_id: number; // resolved: 0 = No Variant
  effective_seed: string | null; // formula resolved with {eID}/{sID}/{gID} tokens
  effective_max_score: number; // num_suits * stack_size (stack_size = num_suits if sudoku else 5)
  created_at: Date;
};

export type CreateGameSlotBody = {
  variant_id?: number | null;
  seed_payload?: string | null;
  nickname?: string | null;
};

export type UpdateGameSlotBody = {
  variant_id?: number | null;
  seed_payload?: string | null;
  nickname?: string | null;
};

// Raw DB row shape — includes joined stage/event rule columns and variant metadata
type GameSlotRaw = GameSlot & {
  event_id: number;
  stage_variant_rule: VariantRule | null;
  stage_seed_rule: { formula?: string } | null;
  event_variant_rule: VariantRule | null;
  event_seed_rule: { formula?: string } | null;
  // Variant metadata per level (from LEFT JOINs on hanabi_variants)
  game_num_suits: number | null;
  game_is_sudoku: boolean | null;
  stage_num_suits: number | null;
  stage_is_sudoku: boolean | null;
  event_num_suits: number | null;
  event_is_sudoku: boolean | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveVariantMeta(row: GameSlotRaw): { numSuits: number; isSudoku: boolean } {
  // Mirror the resolveVariantId cascade: game → stage → event
  if (row.variant_id !== null) {
    return { numSuits: row.game_num_suits ?? 5, isSudoku: row.game_is_sudoku ?? false };
  }
  if (row.stage_variant_rule !== null) {
    return { numSuits: row.stage_num_suits ?? 5, isSudoku: row.stage_is_sudoku ?? false };
  }
  if (row.event_variant_rule !== null) {
    return { numSuits: row.event_num_suits ?? 5, isSudoku: row.event_is_sudoku ?? false };
  }
  return { numSuits: 5, isSudoku: false };
}

function formatGameSlot(row: GameSlotRaw): GameSlot {
  const gameVariantRule: VariantRule | null =
    row.variant_id === null
      ? null
      : row.variant_id === 0
        ? { type: 'none' }
        : { type: 'specific', variantId: row.variant_id };

  const effectiveVariantId =
    resolveVariantId(gameVariantRule, row.stage_variant_rule, row.event_variant_rule) ?? 0;

  const seedFormula =
    row.seed_payload ?? row.stage_seed_rule?.formula ?? row.event_seed_rule?.formula ?? null;

  const effectiveSeed = seedFormula
    ? resolveSeedPayload(seedFormula, {
        eventId: row.event_id,
        stageId: row.stage_id,
        gameIndex: row.game_index,
      })
    : null;

  const { numSuits, isSudoku } = resolveVariantMeta(row);
  const stackSize = isSudoku ? numSuits : 5;
  const effectiveMaxScore = numSuits * stackSize;

  return {
    id: row.id,
    stage_id: row.stage_id,
    game_index: row.game_index,
    nickname: row.nickname,
    variant_id: row.variant_id,
    seed_payload: row.seed_payload,
    result_count: row.result_count,
    effective_variant_id: effectiveVariantId,
    effective_seed: effectiveSeed,
    effective_max_score: effectiveMaxScore,
    created_at: row.created_at,
  };
}

const GAME_SLOT_SELECT = `
  SELECT
    g.id, g.stage_id, g.game_index, g.nickname, g.variant_id, g.seed_payload, g.created_at,
    (SELECT COUNT(*)::int FROM event_game_results r WHERE r.stage_game_id = g.id) AS result_count,
    s.event_id,
    s.variant_rule_json  AS stage_variant_rule,
    s.seed_rule_json     AS stage_seed_rule,
    e.variant_rule_json  AS event_variant_rule,
    e.seed_rule_json     AS event_seed_rule,
    hv_g.num_suits       AS game_num_suits,
    hv_g.is_sudoku       AS game_is_sudoku,
    hv_s.num_suits       AS stage_num_suits,
    hv_s.is_sudoku       AS stage_is_sudoku,
    hv_e.num_suits       AS event_num_suits,
    hv_e.is_sudoku       AS event_is_sudoku
  FROM event_stage_games g
  JOIN event_stages s ON s.id = g.stage_id
  JOIN events e ON e.id = s.event_id
  LEFT JOIN hanabi_variants hv_g ON hv_g.code = g.variant_id
  LEFT JOIN hanabi_variants hv_s ON hv_s.code = (
    CASE WHEN s.variant_rule_json->>'type' = 'none' THEN 0
         WHEN s.variant_rule_json->>'type' = 'specific'
           THEN (s.variant_rule_json->>'variantId')::int
         ELSE NULL END
  )
  LEFT JOIN hanabi_variants hv_e ON hv_e.code = (
    CASE WHEN e.variant_rule_json->>'type' = 'none' THEN 0
         WHEN e.variant_rule_json->>'type' = 'specific'
           THEN (e.variant_rule_json->>'variantId')::int
         ELSE NULL END
  )
`;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listGameSlots(stageId: number): Promise<GameSlot[]> {
  const result = await pool.query<GameSlotRaw>(
    `${GAME_SLOT_SELECT} WHERE g.stage_id = $1 ORDER BY g.game_index`,
    [stageId],
  );
  return result.rows.map(formatGameSlot);
}

export async function getGameSlot(stageId: number, gameId: number): Promise<GameSlot | null> {
  const result = await pool.query<GameSlotRaw>(
    `${GAME_SLOT_SELECT} WHERE g.id = $1 AND g.stage_id = $2`,
    [gameId, stageId],
  );
  return result.rows[0] ? formatGameSlot(result.rows[0]) : null;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Returns any seed_payload values from `seeds` that are already used as
 * literal seeds in a different event.  Only checks literal payloads (no
 * `{...}` tokens) since formula-based seeds are unique by construction.
 */
export async function checkSeedConflicts(eventId: number, seeds: string[]): Promise<string[]> {
  const literals = seeds.filter((s) => s && !s.includes('{'));
  if (literals.length === 0) return [];
  const result = await pool.query<{ seed_payload: string }>(
    `SELECT DISTINCT g.seed_payload
     FROM event_stage_games g
     JOIN event_stages s ON s.id = g.stage_id
     WHERE s.event_id != $1
       AND g.seed_payload = ANY($2)`,
    [eventId, literals],
  );
  return result.rows.map((r) => r.seed_payload);
}

export async function createGameSlot(stageId: number, body: CreateGameSlotBody): Promise<GameSlot> {
  const indexResult = await pool.query<{ next_index: number }>(
    `SELECT COALESCE(MAX(game_index), -1) + 1 AS next_index FROM event_stage_games WHERE stage_id = $1`,
    [stageId],
  );
  const gameIndex = indexResult.rows[0].next_index;

  const inserted = await pool.query<{ id: number }>(
    `INSERT INTO event_stage_games (stage_id, game_index, variant_id, seed_payload, nickname)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [stageId, gameIndex, body.variant_id ?? null, body.seed_payload ?? null, body.nickname ?? null],
  );
  return (await getGameSlot(stageId, inserted.rows[0].id))!;
}

export async function bulkAddGameSlots(
  stageId: number,
  count: number,
  seeds?: string[],
): Promise<GameSlot[]> {
  const indexResult = await pool.query<{ next_index: number }>(
    `SELECT COALESCE(MAX(game_index), -1) + 1 AS next_index FROM event_stage_games WHERE stage_id = $1`,
    [stageId],
  );
  const startIndex = indexResult.rows[0].next_index;

  const created: GameSlot[] = [];
  for (let i = 0; i < count; i++) {
    const gameIndex = startIndex + i;
    const seedPayload = seeds ? (seeds[i] ?? null) : null;
    const inserted = await pool.query<{ id: number }>(
      `INSERT INTO event_stage_games (stage_id, game_index, seed_payload)
       VALUES ($1, $2, $3) RETURNING id`,
      [stageId, gameIndex, seedPayload],
    );
    const slot = await getGameSlot(stageId, inserted.rows[0].id);
    if (slot) created.push(slot);
  }
  return created;
}

export async function updateGameSlot(
  stageId: number,
  gameId: number,
  body: UpdateGameSlotBody,
): Promise<GameSlot | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(body, 'variant_id')) {
    fields.push(`variant_id = $${values.length + 1}`);
    values.push(body.variant_id ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'seed_payload')) {
    fields.push(`seed_payload = $${values.length + 1}`);
    values.push(body.seed_payload ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'nickname')) {
    fields.push(`nickname = $${values.length + 1}`);
    values.push(body.nickname ?? null);
  }

  if (fields.length > 0) {
    values.push(gameId, stageId);
    const result = await pool.query(
      `UPDATE event_stage_games SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND stage_id = $${values.length}
       RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
  }

  return getGameSlot(stageId, gameId);
}

export async function reorderGameSlot(
  stageId: number,
  gameId: number,
  newIndex: number,
): Promise<GameSlot | null> {
  const current = await pool.query<{ game_index: number }>(
    `SELECT game_index FROM event_stage_games WHERE id = $1 AND stage_id = $2`,
    [gameId, stageId],
  );
  if ((current.rowCount ?? 0) === 0) return null;

  const oldIndex = current.rows[0].game_index;
  if (oldIndex === newIndex) return getGameSlot(stageId, gameId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS uq_stage_game_index DEFERRED');

    // Park at a temporary negative index to free the slot
    await client.query(`UPDATE event_stage_games SET game_index = $1 WHERE id = $2`, [
      -gameId,
      gameId,
    ]);

    if (oldIndex < newIndex) {
      await client.query(
        `UPDATE event_stage_games
         SET game_index = game_index - 1
         WHERE stage_id = $1 AND game_index > $2 AND game_index <= $3`,
        [stageId, oldIndex, newIndex],
      );
    } else {
      await client.query(
        `UPDATE event_stage_games
         SET game_index = game_index + 1
         WHERE stage_id = $1 AND game_index >= $2 AND game_index < $3`,
        [stageId, newIndex, oldIndex],
      );
    }

    await client.query(`UPDATE event_stage_games SET game_index = $1 WHERE id = $2`, [
      newIndex,
      gameId,
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getGameSlot(stageId, gameId);
}

export async function deleteGameSlot(
  stageId: number,
  gameId: number,
): Promise<boolean | 'has_results'> {
  const resultCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_game_results WHERE stage_game_id = $1`,
    [gameId],
  );
  if (parseInt(resultCheck.rows[0].count, 10) > 0) return 'has_results';

  const result = await pool.query(`DELETE FROM event_stage_games WHERE id = $1 AND stage_id = $2`, [
    gameId,
    stageId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
