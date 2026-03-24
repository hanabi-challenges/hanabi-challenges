// Game template utility.
//
// Templates are anonymized No Variant game exports pulled from hanab.live by
// scripts/pull-game-templates.ts and stored in apps/api/fixtures/no-variant-templates.json.
//
// At simulation time, pick a random template for the right player count and
// inject the desired parameters (players, timestamps, game ID, seed).  The
// deck and action sequence are unchanged, so the real game engine produces
// authentic KPIs for the simulated game.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GameExport } from '../clients/hanab-live';

// ---------------------------------------------------------------------------
// Types (re-exported so simulation scripts don't need to import from the script)
// ---------------------------------------------------------------------------

export type GameTemplate = {
  playerCount: number;
  score: number;
  endCondition: number;
  options: {
    variantID?: number;
    cardCycle?: boolean;
    deckPlays?: boolean;
    emptyClues?: boolean;
    oneExtraCard?: boolean;
    oneLessCard?: boolean;
    allOrNothing?: boolean;
    detrimentalCharacters?: boolean;
  };
  deck: Array<{ suitIndex: number; rank: number }>;
  actions: Array<{ type: number; target: number; value: number }>;
};

// ---------------------------------------------------------------------------
// Loader (lazy, cached)
// ---------------------------------------------------------------------------

const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/no-variant-templates.json');

let _cache: GameTemplate[] | null = null;

function loadTemplates(): GameTemplate[] {
  if (_cache) return _cache;
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Game template fixtures not found at ${FIXTURE_PATH}.\n` +
        `Run: pnpm tsx scripts/pull-game-templates.ts`,
    );
  }
  _cache = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as GameTemplate[];
  return _cache;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a random anonymized game template for the given player count.
 * Throws if no templates are available for that count (run the pull script).
 */
export function pickTemplate(playerCount: number): GameTemplate {
  const pool = loadTemplates().filter((t) => t.playerCount === playerCount);
  if (pool.length === 0) {
    throw new Error(
      `No game templates available for ${playerCount}-player games. ` +
        `Run: pnpm tsx scripts/pull-game-templates.ts`,
    );
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Merges a template with simulation parameters to produce a GameExport that
 * can be passed directly to ingestFromExport().
 *
 * The deck and action sequence from the template are preserved exactly; only
 * the identifying fields (players, gameId, seed, timestamps) are replaced.
 */
export function applyTemplate(
  template: GameTemplate,
  params: {
    /** Fake (locally unique) game ID — does not correspond to a real h-live game. */
    gameId: number;
    /** Player display names in seat order — must match template.playerCount. */
    players: string[];
    /** Full hanab.live seed string (e.g. "p2v0sNVC25-1"). */
    seed: string;
    /** ISO timestamp for when the game ended. */
    playedAt: string;
    /** ISO timestamp for when the game started (optional). */
    startedAt?: string;
  },
): GameExport {
  if (params.players.length !== template.playerCount) {
    throw new Error(
      `Template requires ${template.playerCount} players, got ${params.players.length}`,
    );
  }
  return {
    gameId: params.gameId,
    players: params.players,
    seed: params.seed,
    score: template.score,
    endCondition: template.endCondition,
    options: template.options,
    datetimeStarted: params.startedAt ?? null,
    datetimeFinished: params.playedAt,
    deck: template.deck,
    actions: template.actions,
  };
}
