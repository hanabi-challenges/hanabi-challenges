import {
  extractReplayExportPlayers,
  extractReplayHistoryGames,
  normalizeReplayEndCondition,
} from './replay-parse';

const TIMEOUT_MS = 10_000;

const FLAG_KEYS = [
  'cardCycle',
  'deckPlays',
  'emptyClues',
  'oneExtraCard',
  'oneLessCard',
  'allOrNothing',
  'detrimentalCharacters',
] as const;

type FlagKey = (typeof FLAG_KEYS)[number];

type ReplayHistoryGame = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  score?: number | null;
  endCondition?: unknown;
  datetimeFinished?: string | null;
  datetimeFinishedUtc?: string | null;
  datetime_finished?: string | null;
  datetimeStarted?: string | null;
  datetimeStartedUtc?: string | null;
  datetime_started?: string | null;
  cardCycle?: boolean;
  deckPlays?: boolean;
  emptyClues?: boolean;
  oneExtraCard?: boolean;
  oneLessCard?: boolean;
  allOrNothing?: boolean;
  detrimentalCharacters?: boolean;
  options?: {
    variantID?: number | null;
    cardCycle?: boolean;
    deckPlays?: boolean;
    emptyClues?: boolean;
    oneExtraCard?: boolean;
    oneLessCard?: boolean;
    allOrNothing?: boolean;
    detrimentalCharacters?: boolean;
  };
};

export type ReplayValidationInput = {
  gameId: number;
  /** Display names of all confirmed team members */
  teamPlayerPool: string[];
  /** If true, replay players must exactly match the full team pool */
  enforceExactTeamMatch: boolean;
  /** Game slot's variant_id — null means no restriction */
  variantId: number | null;
  /** Game slot's seed_payload — null means no restriction */
  seedPayload: string | null;
};

export type ReplayValidationSuccess = {
  ok: true;
  gameId: number;
  exportPlayers: string[];
  seedString: string;
  derived: {
    seedSuffix: string;
    teamSize: number;
    variantId: number | null;
    score: number | null;
    endCondition: number | null;
    startedAt: string | null;
    playedAt: string | null;
  };
};

export type ReplayValidationError = {
  ok: false;
  status: number;
  message: string;
  code?: string;
};

export type ReplayValidationResult = ReplayValidationSuccess | ReplayValidationError;

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return await response.json();
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error('timeout');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function runReplayValidation(
  input: ReplayValidationInput,
): Promise<ReplayValidationResult> {
  const { gameId, teamPlayerPool, enforceExactTeamMatch, variantId, seedPayload } = input;

  function err(status: number, message: string, extra?: { code?: string }): ReplayValidationError {
    return { ok: false, status, message, ...extra };
  }

  let step = 'init';
  try {
    // -------------------------------------------------------------------------
    // Stage 1: export — validate players, seed, and variant
    // -------------------------------------------------------------------------
    step = 'fetch export';
    const exportJson = await fetchJsonWithTimeout(`https://hanab.live/export/${gameId}`);
    if (!exportJson || typeof exportJson !== 'object') {
      return err(400, 'Invalid export payload from hanab.live');
    }

    const exportPlayers = extractReplayExportPlayers(exportJson);
    if (!exportPlayers || exportPlayers.length === 0) {
      return err(400, 'Replay export is missing a valid players list');
    }

    const seedString = (exportJson as { seed?: string }).seed ?? '';

    const duplicatePlayers = exportPlayers.filter(
      (p) => exportPlayers.findIndex((c) => c === p) !== exportPlayers.lastIndexOf(p),
    );
    if (duplicatePlayers.length > 0) {
      return err(
        400,
        `Replay includes duplicate players: ${[...new Set(duplicatePlayers)].join(', ')}`,
      );
    }

    const nonPoolPlayers = exportPlayers.filter((p) => !teamPlayerPool.includes(p));
    if (nonPoolPlayers.length > 0) {
      return err(
        400,
        `Replay includes players not in this team pool: ${nonPoolPlayers.join(', ')}`,
      );
    }

    if (enforceExactTeamMatch) {
      const missingPlayers = teamPlayerPool.filter((p) => !exportPlayers.includes(p));
      if (missingPlayers.length > 0 || exportPlayers.length !== teamPlayerPool.length) {
        return err(
          400,
          `Replay team must exactly match registered team players: ${teamPlayerPool.join(', ')}`,
        );
      }
    }

    const seedMatch = seedString.match(/p(\d+)v(\d+)s([A-Za-z0-9]+)/);
    if (!seedMatch) {
      return err(400, 'Seed string from replay is not in expected format');
    }
    const seedPlayers = Number(seedMatch[1]);
    const seedVariantId = Number(seedMatch[2]);
    const seedSuffix = seedMatch[3];

    if (seedPlayers !== exportPlayers.length) {
      return err(
        400,
        `Replay seed is for ${seedPlayers}p but replay has ${exportPlayers.length} players`,
      );
    }

    if (seedPayload && seedSuffix !== seedPayload) {
      return err(
        400,
        `Replay seed suffix "${seedSuffix}" does not match expected "${seedPayload}"`,
      );
    }

    if (variantId !== null && seedVariantId !== variantId) {
      return err(
        400,
        `Replay seed variant ID ${seedVariantId} does not match game slot variant ID ${variantId}`,
      );
    }

    // -------------------------------------------------------------------------
    // Stage 2: history-full — validate flags, variant, and capture score/dates
    // -------------------------------------------------------------------------
    step = 'fetch history';
    const historyData = await fetchJsonWithTimeout(
      `https://hanab.live/api/v1/history-full/${encodeURIComponent(exportPlayers[0])}?start=${gameId}&end=${gameId}`,
    );

    const historyGames = extractReplayHistoryGames<ReplayHistoryGame>(historyData);
    const game = historyGames.find((g) => String(g.id ?? g.gameId ?? g.game_id) === String(gameId));
    if (!game) {
      return err(400, `Game ${gameId} not found in history for player "${exportPlayers[0]}"`);
    }

    const opts = game.options ?? {};

    // Cross-check variant from history against seed and game slot
    const historyVariantId = opts.variantID ?? null;
    if (historyVariantId !== null) {
      if (historyVariantId !== seedVariantId) {
        return err(
          400,
          `History variant ID ${historyVariantId} does not match seed variant ID ${seedVariantId}`,
        );
      }
      if (variantId !== null && historyVariantId !== variantId) {
        return err(
          400,
          `History variant ID ${historyVariantId} does not match game slot variant ID ${variantId}`,
        );
      }
    }

    // All optional-rule flags must be false (or absent)
    const flagFailures: FlagKey[] = [];
    for (const key of FLAG_KEYS) {
      if ((game[key] ?? opts[key]) === true) {
        flagFailures.push(key);
      }
    }
    if (flagFailures.length > 0) {
      return err(400, `Replay uses unsupported optional rules: ${flagFailures.join(', ')}`);
    }

    const score = game.score == null ? null : Number(game.score);
    const endCondition = normalizeReplayEndCondition(game.endCondition);
    const startedAt =
      game.datetimeStarted ?? game.datetimeStartedUtc ?? game.datetime_started ?? null;
    const playedAt =
      game.datetimeFinished ?? game.datetimeFinishedUtc ?? game.datetime_finished ?? null;

    return {
      ok: true,
      gameId,
      exportPlayers,
      seedString,
      derived: {
        seedSuffix,
        teamSize: seedPlayers,
        variantId: historyVariantId ?? variantId,
        score,
        endCondition,
        startedAt,
        playedAt,
      },
    };
  } catch (caughtErr) {
    const e = caughtErr as { message?: string; code?: string; stack?: string };
    const message = e.message ?? 'Failed to validate replay';
    if (message === 'timeout') {
      return {
        ok: false,
        status: 504,
        message: 'Validation timed out contacting hanab.live',
        code: 'TIMEOUT',
      };
    }
    console.error(`[runReplayValidation] error at step="${step}"`, caughtErr);
    return {
      ok: false,
      status: 502,
      message: `Failed to validate replay: ${message}`,
      code: e.code ?? 'FETCH_FAILED',
    };
  }
}
