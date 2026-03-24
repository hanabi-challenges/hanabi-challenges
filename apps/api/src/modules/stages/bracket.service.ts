import { pool } from '../../config/db';
import { resolveVariantId, resolveSeedPayload, type VariantRule } from '../../utils/seed.utils';
import type { MatchRow } from './matches.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BracketMatch = {
  id: number;
  stage_id: number;
  round_number: number;
  team1_id: number;
  team2_id: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  winner_team_id: number | null;
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests)
// ---------------------------------------------------------------------------

/** Returns the smallest power of 2 >= n. */
export function nextPowerOfTwo(n: number): number {
  if (n <= 0) throw new Error('n must be positive');
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Given N entries sorted by seed (1-indexed), returns the round-1 pairings.
 * Each pairing is [seedA, seedB] where seedB may be null (bye for seedA).
 * Uses standard single-elimination seeding: slot i vs slot P+1-i.
 */
export function getRound1Pairings(N: number): [number, number | null][] {
  if (N < 2) throw new Error('Need at least 2 entries');
  const P = nextPowerOfTwo(N);
  const pairings: [number, number | null][] = [];
  for (let i = 1; i <= P / 2; i++) {
    const partnerSlot = P + 1 - i;
    if (partnerSlot > N) {
      pairings.push([i, null]); // slot i gets a bye
    } else {
      pairings.push([i, partnerSlot]);
    }
  }
  return pairings;
}

/**
 * Given the round-R matches (with winners set) and the pre-round-R bracket slots,
 * compute the bracket slots after round R.
 *
 * bracketSlots: Map<slotPosition, teamId> (1-indexed; slots beyond N are absent = bye)
 * bracketSize: total slot count for this round (next power of 2 for round 1, halves each round)
 * Returns new Map<slotPosition, teamId> of length bracketSize / 2.
 */
export function advanceSlots(
  prevSlots: Map<number, number>,
  roundMatches: { team1_id: number; team2_id: number; winner_team_id: number | null }[],
  bracketSize: number,
): Map<number, number> {
  const P = bracketSize;
  const next = new Map<number, number>();

  // Build a lookup: lower-seed-slot → match winner
  const winnerBySlot = new Map<number, number | null>();
  for (const m of roundMatches) {
    // Find which slots team1 and team2 occupy in prevSlots
    let slot1 = -1;
    let slot2 = -1;
    for (const [slot, teamId] of prevSlots) {
      if (teamId === m.team1_id) slot1 = slot;
      if (teamId === m.team2_id) slot2 = slot;
    }
    if (slot1 === -1 || slot2 === -1) continue;
    const lowerSlot = Math.min(slot1, slot2);
    winnerBySlot.set(lowerSlot, m.winner_team_id);
  }

  // For each pair in prevSlots, the lower-numbered slot advances
  for (let i = 1; i <= P / 2; i++) {
    const partnerSlot = P + 1 - i;
    const teamA = prevSlots.get(i);
    const teamB = prevSlots.get(partnerSlot);

    if (teamA !== undefined && teamB !== undefined) {
      // Real match — winner advances
      const winner = winnerBySlot.get(i) ?? null;
      if (winner !== null) next.set(i, winner);
    } else if (teamA !== undefined) {
      // teamA had a bye — auto-advances
      next.set(i, teamA);
    } else if (teamB !== undefined) {
      // teamB had a bye (unusual case: only right-slot filled) — auto-advances to slot i
      next.set(i, teamB);
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getEntriesSortedBySeed(
  stageId: number,
): Promise<{ teamId: number; seed: number }[]> {
  const result = await pool.query<{ event_team_id: number; seed: number | null }>(
    `SELECT event_team_id, seed
     FROM event_match_play_entries
     WHERE stage_id = $1
     ORDER BY seed NULLS LAST, id`,
    [stageId],
  );
  return result.rows.map((r, i) => ({
    teamId: r.event_team_id,
    seed: r.seed ?? i + 1,
  }));
}

async function getMatchesByRound(stageId: number): Promise<Map<number, MatchRow[]>> {
  const result = await pool.query<MatchRow>(
    `SELECT * FROM event_matches WHERE stage_id = $1 ORDER BY round_number, id`,
    [stageId],
  );
  const byRound = new Map<number, MatchRow[]>();
  for (const m of result.rows) {
    if (!byRound.has(m.round_number)) byRound.set(m.round_number, []);
    byRound.get(m.round_number)!.push(m);
  }
  return byRound;
}

/** Compute bracket slots at a given round from entries + completed match history. */
async function computeBracketSlotsAtRound(
  entries: { teamId: number; seed: number }[],
  byRound: Map<number, MatchRow[]>,
  throughRound: number,
): Promise<Map<number, number>> {
  const N = entries.length;
  const P = nextPowerOfTwo(N);

  // Initial slots: entries sorted by seed at positions 1..N; positions N+1..P are absent (byes)
  const sorted = [...entries].sort((a, b) => a.seed - b.seed);
  let slots = new Map<number, number>();
  for (let i = 0; i < sorted.length; i++) {
    slots.set(i + 1, sorted[i].teamId);
  }

  // Advance round by round, halving the bracket size each round
  let currentP = P;
  for (let r = 1; r <= throughRound; r++) {
    const roundMatches = byRound.get(r) ?? [];
    slots = advanceSlots(slots, roundMatches, currentP);
    currentP = currentP / 2;
  }

  return slots;
}

// ---------------------------------------------------------------------------
// T-040 — Helpers for game skeleton creation
// ---------------------------------------------------------------------------

type StageGameConfig = {
  eventId: number;
  gamesCount: number;
  stageVariantRule: VariantRule | null;
  stageSeedFormula: string | null;
  eventVariantRule: VariantRule | null;
  eventSeedFormula: string | null;
};

async function getStageGameConfig(stageId: number): Promise<StageGameConfig | null> {
  const result = await pool.query<{
    event_id: number;
    config_json: Record<string, unknown>;
    variant_rule_json: VariantRule | null;
    seed_rule_json: { formula?: string } | null;
    event_variant_rule_json: VariantRule | null;
    event_seed_rule_json: { formula?: string } | null;
  }>(
    `SELECT
       s.event_id,
       s.config_json,
       s.variant_rule_json,
       s.seed_rule_json,
       e.variant_rule_json AS event_variant_rule_json,
       e.seed_rule_json    AS event_seed_rule_json
     FROM event_stages s
     JOIN events e ON e.id = s.event_id
     WHERE s.id = $1`,
    [stageId],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const gamesCount =
    ((row.config_json?.match_format as Record<string, unknown>)?.games_count as number) ?? 1;
  return {
    eventId: row.event_id,
    gamesCount,
    stageVariantRule: row.variant_rule_json,
    stageSeedFormula: row.seed_rule_json?.formula ?? null,
    eventVariantRule: row.event_variant_rule_json,
    eventSeedFormula: row.event_seed_rule_json?.formula ?? null,
  };
}

async function createMatchGameSkeletons(
  matchId: number,
  stageId: number,
  config: StageGameConfig,
): Promise<void> {
  for (let gameIndex = 1; gameIndex <= config.gamesCount; gameIndex++) {
    const variantId = resolveVariantId(null, config.stageVariantRule, config.eventVariantRule);
    const seedContext = { eventId: config.eventId, stageId, gameIndex, teamSize: null };
    const seedPayload = config.stageSeedFormula
      ? resolveSeedPayload(config.stageSeedFormula, seedContext)
      : config.eventSeedFormula
        ? resolveSeedPayload(config.eventSeedFormula, seedContext)
        : null;

    await pool.query(
      `INSERT INTO event_match_game_results (match_id, game_index, variant_id, seed_payload)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (match_id, game_index) DO NOTHING`,
      [matchId, gameIndex, variantId ?? null, seedPayload],
    );
  }
}

// ---------------------------------------------------------------------------
// T-038 — Generate bracket (round 1 matches)
// ---------------------------------------------------------------------------

export type GenerateBracketResult =
  | { ok: true; matches: BracketMatch[]; byes: number[] }
  | { ok: false; reason: 'no_entries' | 'already_drawn' | 'need_seeds' };

export async function generateBracket(stageId: number): Promise<GenerateBracketResult> {
  const entries = await getEntriesSortedBySeed(stageId);
  if (entries.length < 2) return { ok: false, reason: 'no_entries' };

  // Block if round-1 matches already exist
  const existing = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_matches WHERE stage_id = $1 AND round_number = 1`,
    [stageId],
  );
  if (parseInt(existing.rows[0].count, 10) > 0) return { ok: false, reason: 'already_drawn' };

  const gameConfig = await getStageGameConfig(stageId);

  const sorted = [...entries].sort((a, b) => a.seed - b.seed);
  const N = sorted.length;
  const pairings = getRound1Pairings(N);

  const createdMatches: BracketMatch[] = [];
  const byeSeeds: number[] = [];

  for (const [seedA, seedB] of pairings) {
    if (seedB === null) {
      byeSeeds.push(seedA);
      continue;
    }

    const teamA = sorted[seedA - 1].teamId;
    const teamB = sorted[seedB - 1].teamId;

    const result = await pool.query<BracketMatch>(
      `INSERT INTO event_matches (stage_id, round_number, team1_id, team2_id)
       VALUES ($1, 1, $2, $3)
       RETURNING *`,
      [stageId, teamA, teamB],
    );
    const match = result.rows[0];
    createdMatches.push(match);

    if (gameConfig) {
      await createMatchGameSkeletons(match.id, stageId, gameConfig);
    }
  }

  return { ok: true, matches: createdMatches, byes: byeSeeds };
}

// ---------------------------------------------------------------------------
// T-039 — Advance bracket (generate next round matches)
// ---------------------------------------------------------------------------

export type AdvanceBracketResult =
  | { ok: true; matches: BracketMatch[]; is_final: boolean }
  | { ok: false; reason: 'no_matches' | 'round_not_complete' | 'bracket_complete' | 'no_winner' };

export async function advanceBracket(stageId: number): Promise<AdvanceBracketResult> {
  const byRound = await getMatchesByRound(stageId);
  if (byRound.size === 0) return { ok: false, reason: 'no_matches' };

  // Find the current (highest) round
  const currentRound = Math.max(...byRound.keys());
  const currentMatches = byRound.get(currentRound)!;

  // All current-round matches must be COMPLETE
  if (currentMatches.some((m) => m.status !== 'COMPLETE')) {
    return { ok: false, reason: 'round_not_complete' };
  }
  // All current-round matches must have a winner
  if (currentMatches.some((m) => m.winner_team_id === null)) {
    return { ok: false, reason: 'no_winner' };
  }

  // Bracket is done when there is exactly one match in the current round
  if (currentMatches.length === 1) {
    return { ok: false, reason: 'bracket_complete' };
  }

  // Compute slots after the current round
  const entries = await getEntriesSortedBySeed(stageId);
  const slots = await computeBracketSlotsAtRound(entries, byRound, currentRound);

  if (slots.size < 2) return { ok: false, reason: 'bracket_complete' };

  // Generate next-round pairings from current slots
  const sortedSlotNums = [...slots.keys()].sort((a, b) => a - b);
  const M = sortedSlotNums.length;

  const nextRound = currentRound + 1;
  const createdMatches: BracketMatch[] = [];
  const gameConfig = await getStageGameConfig(stageId);

  for (let i = 0; i < M / 2; i++) {
    const slotA = sortedSlotNums[i];
    const slotB = sortedSlotNums[M - 1 - i];

    const teamA = slots.get(slotA);
    const teamB = slots.get(slotB);

    if (teamA === undefined || teamB === undefined) continue;

    const result = await pool.query<BracketMatch>(
      `INSERT INTO event_matches (stage_id, round_number, team1_id, team2_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [stageId, nextRound, teamA, teamB],
    );
    const match = result.rows[0];
    createdMatches.push(match);

    if (gameConfig) {
      await createMatchGameSkeletons(match.id, stageId, gameConfig);
    }
  }

  const isFinal = createdMatches.length === 1;
  return { ok: true, matches: createdMatches, is_final: isFinal };
}
