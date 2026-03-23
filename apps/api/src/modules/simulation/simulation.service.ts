// Simulation service — writes and reads the simulation_games table.
//
// Only used when SIMULATION_MODE=true.  The mock hanab-live routes read from
// this table to serve /api/v1/seed/:fullSeed and /export/:gameId responses.

import { pool } from '../../config/db';
import type { GameTemplate } from '../../utils/game-template';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SimulationGameRow = {
  id: number;
  full_seed: string;
  players: string[];
  score: number;
  end_condition: number;
  options_json: Record<string, unknown>;
  datetime_started: Date | null;
  datetime_finished: Date | null;
  actions: unknown[];
  deck: unknown[];
  slot_id: number | null;
  ingest_outcome: string | null;
};

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Insert a simulated game into the simulation_games table.
 * Returns the auto-assigned game ID.
 */
export async function insertSimulatedGame(params: {
  fullSeed: string;
  players: string[];
  template: GameTemplate;
  playedAt: string;
  startedAt?: string;
  slotId?: number;
}): Promise<number> {
  const { fullSeed, players, template, playedAt, startedAt, slotId } = params;
  const row = await pool.query<{ id: number }>(
    `INSERT INTO simulation_games
       (full_seed, players, score, end_condition, options_json,
        datetime_started, datetime_finished, actions, deck, slot_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      fullSeed,
      players,
      template.score,
      template.endCondition,
      JSON.stringify(template.options),
      startedAt ?? null,
      playedAt,
      JSON.stringify(template.actions),
      JSON.stringify(template.deck),
      slotId ?? null,
    ],
  );
  return row.rows[0].id;
}

/**
 * Bulk-set ingest_outcome on simulation_games rows.
 * Only updates rows whose ID falls in the simulation range (≥ 9,000,000,000).
 * Called by simulation services after ingestGameSlot() returns per-game outcomes.
 */
export async function updateSimulationOutcomes(
  outcomes: { gameId: number; outcome: string }[],
): Promise<void> {
  const sim = outcomes.filter((o) => o.gameId >= 9_000_000_000);
  if (sim.length === 0) return;
  await pool.query(
    `UPDATE simulation_games SET ingest_outcome = data.outcome
     FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS outcome) data
     WHERE simulation_games.id = data.id`,
    [sim.map((o) => o.gameId), sim.map((o) => o.outcome)],
  );
}

// ---------------------------------------------------------------------------
// Read (used by mock hanab-live routes)
// ---------------------------------------------------------------------------

export async function getSimulatedGamesBySeed(
  fullSeed: string,
  page: number,
  size: number,
): Promise<{ totalRows: number; rows: SimulationGameRow[] }> {
  const countRow = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text FROM simulation_games WHERE full_seed = $1`,
    [fullSeed],
  );
  const totalRows = parseInt(countRow.rows[0].count, 10);

  const rows = await pool.query<SimulationGameRow>(
    `SELECT id, full_seed, players, score, end_condition, options_json,
            datetime_started, datetime_finished, actions, deck
     FROM simulation_games
     WHERE full_seed = $1
     ORDER BY id ASC
     LIMIT $2 OFFSET $3`,
    [fullSeed, size, page * size],
  );

  return { totalRows, rows: rows.rows };
}

export async function getSimulatedGameById(id: number): Promise<SimulationGameRow | null> {
  const row = await pool.query<SimulationGameRow>(
    `SELECT id, full_seed, players, score, end_condition, options_json,
            datetime_started, datetime_finished, actions, deck
     FROM simulation_games WHERE id = $1`,
    [id],
  );
  return row.rows[0] ?? null;
}
