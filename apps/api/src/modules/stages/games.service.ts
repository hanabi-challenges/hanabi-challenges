import { pool } from '../../config/db';
import { propagateToGameSlots } from './stages.service';

export type GameSlot = {
  id: number;
  stage_id: number;
  game_index: number;
  team_size: number | null;
  variant_id: number | null;
  seed_payload: string | null;
  max_score: number | null;
  created_at: Date;
};

export type CreateGameSlotBody = {
  game_index: number;
  team_size?: number | null;
  variant_id?: number | null;
  seed_payload?: string | null;
  max_score?: number | null;
};

export type UpdateGameSlotBody = {
  variant_id?: number | null;
  seed_payload?: string | null;
  max_score?: number | null;
};

export async function listGameSlots(stageId: number, teamSize?: number): Promise<GameSlot[]> {
  if (teamSize !== undefined) {
    const result = await pool.query<GameSlot>(
      `SELECT * FROM event_stage_games WHERE stage_id = $1 AND team_size = $2 ORDER BY game_index`,
      [stageId, teamSize],
    );
    return result.rows;
  }
  const result = await pool.query<GameSlot>(
    `SELECT * FROM event_stage_games WHERE stage_id = $1 ORDER BY game_index, team_size NULLS FIRST`,
    [stageId],
  );
  return result.rows;
}

export async function getGameSlot(stageId: number, gameId: number): Promise<GameSlot | null> {
  const result = await pool.query<GameSlot>(
    `SELECT * FROM event_stage_games WHERE id = $1 AND stage_id = $2`,
    [gameId, stageId],
  );
  return result.rows[0] ?? null;
}

export async function createGameSlot(
  stageId: number,
  body: CreateGameSlotBody,
): Promise<GameSlot | 'duplicate'> {
  try {
    const result = await pool.query<GameSlot>(
      `INSERT INTO event_stage_games (stage_id, game_index, team_size, variant_id, seed_payload, max_score)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        stageId,
        body.game_index,
        body.team_size ?? null,
        body.variant_id ?? null,
        body.seed_payload ?? null,
        body.max_score ?? null,
      ],
    );
    return result.rows[0];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) return 'duplicate';
    throw err;
  }
}

export async function createGameSlotsBatch(
  stageId: number,
  slots: CreateGameSlotBody[],
): Promise<{ created: GameSlot[]; duplicates: number }> {
  const created: GameSlot[] = [];
  let duplicates = 0;

  for (const slot of slots) {
    const result = await createGameSlot(stageId, slot);
    if (result === 'duplicate') {
      duplicates++;
    } else {
      created.push(result);
    }
  }

  return { created, duplicates };
}

export async function cloneGameSlot(
  stageId: number,
  gameId: number,
): Promise<GameSlot | 'not_found' | 'duplicate'> {
  const source = await getGameSlot(stageId, gameId);
  if (!source) return 'not_found';

  const maxResult = await pool.query<{ max: number | null }>(
    `SELECT MAX(game_index) AS max FROM event_stage_games WHERE stage_id = $1 AND (team_size = $2 OR (team_size IS NULL AND $2 IS NULL))`,
    [stageId, source.team_size],
  );
  const nextIndex = (maxResult.rows[0].max ?? -1) + 1;

  return createGameSlot(stageId, {
    game_index: nextIndex,
    team_size: source.team_size,
    variant_id: source.variant_id,
    seed_payload: source.seed_payload,
    max_score: source.max_score,
  });
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
  if (Object.prototype.hasOwnProperty.call(body, 'max_score')) {
    fields.push(`max_score = $${values.length + 1}`);
    values.push(body.max_score ?? null);
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

export async function deleteGameSlot(
  stageId: number,
  gameId: number,
): Promise<boolean | 'has_results'> {
  // Check if results exist for this specific game slot
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

export async function propagateGames(stageId: number, overrideExisting = false): Promise<void> {
  await propagateToGameSlots(stageId, { overrideExisting });
}
