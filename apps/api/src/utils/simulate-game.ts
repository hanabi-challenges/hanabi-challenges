// Simulation utility: write a randomly-selected No Variant game template to the
// simulation_games table so the normal ingestion pipeline can pull it.
//
// Requires SIMULATION_MODE=true and HANAB_LIVE_BASE_URL pointing at this
// server.  The full seed must match what ingestGameSlot constructs for the
// target slot: buildFullSeed(playerCount, variantId, slot.effective_seed)
//
// Usage:
//   import { simulateGame } from '../src/utils/simulate-game';
//   import { buildFullSeed } from '../src/clients/hanab-live';
//
//   await simulateGame({
//     fullSeed: buildFullSeed(2, 0, 'NVC7'),
//     players: ['alice', 'bob'],
//     playedAt: '2025-06-01T14:00:00Z',
//   });
//   // Then run ingestGameSlot() for the slot as normal.

import { pickTemplate } from './game-template';
import { insertSimulatedGame } from '../modules/simulation/simulation.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SimulateGameParams = {
  /**
   * Full hanab.live seed string, e.g. "p2v0sNVC7".
   * Must match buildFullSeed(playerCount, variantId, effectiveSeed) for the
   * slot that ingestGameSlot will be called against.
   */
  fullSeed: string;
  /**
   * hanab.live display names in seat order, one per player.
   * Length determines which template pool to draw from (2–6).
   */
  players: string[];
  /** ISO timestamp for when the game ended. */
  playedAt: string;
  /** ISO timestamp for when the game started (optional). */
  startedAt?: string;
  /** event_stage_games.id — stored on the simulation_games row for result reporting. */
  slotId?: number;
};

export type SimulatedGameSummary = {
  /** Auto-assigned ID from simulation_games (≥ 9,000,000,000). */
  gameId: number;
  fullSeed: string;
  players: string[];
  /** Score from the selected template. */
  score: number;
  playedAt: string;
};

// ---------------------------------------------------------------------------
// simulateGame
// ---------------------------------------------------------------------------

/**
 * Pick a random game template for the given player count, then insert it into
 * simulation_games with the supplied parameters.
 *
 * After calling this (once per game in the scenario), run ingestGameSlot()
 * for each slot using the normal pipeline — it will hit the mock hanab-live
 * routes (served by this API when SIMULATION_MODE=true) to fetch the games.
 */
export async function simulateGame(params: SimulateGameParams): Promise<SimulatedGameSummary> {
  const { fullSeed, players, playedAt, startedAt, slotId } = params;
  const template = pickTemplate(players.length);

  const gameId = await insertSimulatedGame({
    fullSeed,
    players,
    template,
    playedAt,
    startedAt,
    slotId,
  });

  return { gameId, fullSeed, players, score: template.score, playedAt };
}
