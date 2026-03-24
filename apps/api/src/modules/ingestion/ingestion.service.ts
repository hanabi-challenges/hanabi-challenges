// Replay ingestion service.
//
// For each game slot that has a resolved seed, this service:
//   1. Fetches all hanab.live games for every (teamSize × variantId) seed combination.
//   2. Applies first-play-per-player deduplication (chronological order):
//      a game is ingested only if every player in it is appearing for the first
//      time for this seed.  A player who appeared in any prior game (even a
//      skipped one) is considered "seen" and blocks further games.
//   3. Creates shadow users for any player whose display_name is not yet in the
//      users table.
//   4. Finds or creates an event team whose membership exactly matches the
//      game's player set (all members confirmed immediately).
//   5. Auto-registers all members and inserts the result row.
//   6. Updates last_replays_pulled_at on the game slot.

import { pool } from '../../config/db';
import { findOrCreateShadowUser } from '../auth/auth.service';
import { fetchGamesBySeed, fetchGameExport, buildFullSeed } from '../../clients/hanab-live';
import type { GameExport } from '../../clients/hanab-live';
import { extractGameKPIs } from '../replay/game-engine.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameOutcome = {
  gameId: number;
  outcome: string; // 'ingested' | 'skipped:*' | 'error:*'
};

export type IngestSlotResult = {
  ingested: number;
  skipped: number;
  errors: string[];
  gameOutcomes: GameOutcome[];
};

type EventMeta = {
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  multi_registration: string;
};

type StageWindow = {
  starts_at: Date | null;
  ends_at: Date | null;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find pre-registered teams whose confirmed membership exactly matches userIds
 * (same players, no extras).  Both event-scoped and stage-scoped teams are
 * considered.  Teams that have already submitted a result for this slot are
 * returned separately so the caller can distinguish "no match" from "already played".
 */
async function findMatchingTeams(
  eventId: number,
  slotId: number,
  userIds: number[],
): Promise<{ open: number[]; alreadyPlayed: number[] }> {
  const size = userIds.length;
  const rows = await pool.query<{ id: number; already_played: boolean }>(
    `SELECT et.id,
            EXISTS (
              SELECT 1 FROM event_game_results egr
              WHERE egr.event_team_id = et.id
                AND egr.stage_game_id = $2
                AND egr.attempt_id IS NULL
            ) AS already_played
     FROM event_teams et
     WHERE et.event_id = $1
       AND (
         et.stage_id IS NULL
         OR et.stage_id = (SELECT stage_id FROM event_stage_games WHERE id = $2)
       )
       AND et.team_size = $3
       AND (
         SELECT COUNT(*) FROM event_team_members etm
         WHERE etm.event_team_id = et.id
           AND etm.user_id = ANY($4)
           AND etm.confirmed = TRUE
       ) = $3
       AND NOT EXISTS (
         SELECT 1 FROM event_team_members etm2
         WHERE etm2.event_team_id = et.id
           AND etm2.user_id != ALL($4)
       )`,
    [eventId, slotId, size, userIds],
  );
  const open: number[] = [];
  const alreadyPlayed: number[] = [];
  for (const row of rows.rows) {
    if (row.already_played) alreadyPlayed.push(row.id);
    else open.push(row.id);
  }
  return { open, alreadyPlayed };
}

/** Create an event-scoped team with all members pre-confirmed. */
async function createIngestedEventTeam(eventId: number, userIds: number[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Auto-register all members
    for (const uid of userIds) {
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (event_id, user_id) DO UPDATE
           SET status = CASE
             WHEN event_registrations.status = 'WITHDRAWN' THEN 'ACTIVE'
             ELSE event_registrations.status
           END`,
        [eventId, uid],
      );
    }

    const teamRow = await client.query<{ id: number }>(
      `INSERT INTO event_teams (event_id, stage_id, team_size, source)
       VALUES ($1, NULL, $2, 'REGISTERED')
       RETURNING id`,
      [eventId, userIds.length],
    );
    const teamId = teamRow.rows[0].id;

    for (const uid of userIds) {
      await client.query(
        `INSERT INTO event_team_members (event_team_id, user_id, confirmed)
         VALUES ($1, $2, TRUE)`,
        [teamId, uid],
      );
    }

    await client.query('COMMIT');
    return teamId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns true if creating a new team for these users would violate the
 * event's multi_registration policy.
 *
 * ONE         – player may be on only one team (any size) per event.
 * ONE_PER_SIZE – player may be on only one team per team size per event.
 * UNRESTRICTED – no limit.
 */
async function wouldViolateMultiRegistration(
  eventId: number,
  userIds: number[],
  teamSize: number,
  policy: string,
): Promise<boolean> {
  if (policy === 'UNRESTRICTED') return false;

  let query: string;
  let params: unknown[];

  if (policy === 'ONE_PER_SIZE') {
    query = `SELECT EXISTS (
      SELECT 1 FROM event_teams et
      JOIN event_team_members etm ON etm.event_team_id = et.id
      WHERE et.event_id = $1
        AND et.team_size = $2
        AND etm.user_id = ANY($3)
        AND etm.confirmed = TRUE
    )`;
    params = [eventId, teamSize, userIds];
  } else {
    // ONE: any team, any size
    query = `SELECT EXISTS (
      SELECT 1 FROM event_teams et
      JOIN event_team_members etm ON etm.event_team_id = et.id
      WHERE et.event_id = $1
        AND etm.user_id = ANY($2)
        AND etm.confirmed = TRUE
    )`;
    params = [eventId, userIds];
  }

  const row = await pool.query<{ exists: boolean }>(query, params);
  return row.rows[0].exists;
}

/** Upsert the raw hanab.live export into the cache table. Non-fatal if it fails. */
async function persistGameExport(exp: {
  gameId: number;
  seed: string;
  players: string[];
  score: number;
  endCondition: number;
  variantId: number | undefined;
  optionsJson: Record<string, unknown>;
  datetimeStarted: string | null;
  datetimeFinished: string | null;
  actions: unknown[];
  deck: unknown[];
  tags: string[];
}): Promise<void> {
  await pool.query(
    `INSERT INTO hanabi_live_game_exports
       (game_id, seed, players, score, end_condition, variant_id, options_json,
        datetime_started, datetime_finished, actions, deck, tags, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10, $11, $12, NOW())
     ON CONFLICT (game_id) DO UPDATE SET
       tags = CASE
         WHEN EXCLUDED.tags = '{}' THEN hanabi_live_game_exports.tags
         ELSE EXCLUDED.tags
       END`,
    [
      exp.gameId,
      exp.seed,
      exp.players,
      exp.score,
      exp.endCondition,
      exp.variantId ?? null,
      JSON.stringify(exp.optionsJson),
      exp.datetimeStarted,
      exp.datetimeFinished,
      JSON.stringify(exp.actions),
      JSON.stringify(exp.deck),
      exp.tags,
    ],
  );
}

/** Insert a result row, skipping silently if the (team, game, attempt) tuple already exists. */
async function insertIngestedResult(
  teamId: number,
  slotId: number,
  hanabLiveGameId: number,
  score: number,
  bottomDeckRisk: number | null,
  strikes: number | null,
  cluesRemaining: number | null,
  startedAt: string | null,
  playedAt: string | null,
  userIds: number[],
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const resultRow = await client.query<{ id: number }>(
      `INSERT INTO event_game_results
         (event_team_id, stage_game_id, score, bottom_deck_risk, strikes, clues_remaining,
          hanabi_live_game_id, started_at, played_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (event_team_id, stage_game_id, attempt_id) DO NOTHING
       RETURNING id`,
      [
        teamId,
        slotId,
        score,
        bottomDeckRisk,
        strikes,
        cluesRemaining,
        hanabLiveGameId,
        startedAt ?? null,
        playedAt ?? new Date().toISOString(),
      ],
    );

    if ((resultRow.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false; // already existed
    }

    const resultId = resultRow.rows[0].id;
    for (const uid of userIds) {
      await client.query(
        `INSERT INTO event_game_result_participants (game_result_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [resultId, uid],
      );
    }

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest all hanab.live replays for a single game slot.
 *
 * @param slotId           event_stage_games.id
 * @param eventId          the owning event
 * @param allowedTeamSizes sizes to query (one full seed per size)
 * @param effectiveSeed    the seed suffix (our stored formula result, e.g. "e1s3g1")
 * @param effectiveVariantId hanab.live variant ID (0 = No Variant)
 * @param eventMeta        registration cutoff info for auto-registration
 */
export async function ingestGameSlot(params: {
  slotId: number;
  eventId: number;
  allowedTeamSizes: number[];
  effectiveSeed: string;
  effectiveVariantId: number;
  eventMeta: EventMeta;
  stageWindow?: StageWindow;
}): Promise<IngestSlotResult> {
  const {
    slotId,
    eventId,
    allowedTeamSizes,
    effectiveSeed,
    effectiveVariantId,
    eventMeta,
    stageWindow,
  } = params;
  const result: IngestSlotResult = { ingested: 0, skipped: 0, errors: [], gameOutcomes: [] };

  // Check registration cutoff
  const now = new Date();
  if (
    eventMeta.registration_cutoff !== null &&
    now > eventMeta.registration_cutoff &&
    !eventMeta.allow_late_registration
  ) {
    result.errors.push('Registration closed; skipping slot');
    return result;
  }

  // ------------------------------------------------------------------
  // Step 1: collect all candidate games from hanab.live across every
  // allowed team size, then sort oldest-first.
  // ------------------------------------------------------------------
  type CandidateGame = {
    id: number;
    fullSeed: string;
    score: number; // from the seed-list API; used as score fallback when engine can't run
    datetimeStarted: string | null;
    datetimeFinished: string | null;
    tags: string[];
  };

  const candidates: CandidateGame[] = [];
  for (const teamSize of allowedTeamSizes) {
    const fullSeed = buildFullSeed(teamSize, effectiveVariantId, effectiveSeed);
    try {
      const games = await fetchGamesBySeed(fullSeed);
      for (const g of games) {
        candidates.push({
          id: g.id,
          fullSeed,
          score: g.score,
          datetimeStarted: g.datetimeStarted,
          datetimeFinished: g.datetimeFinished,
          tags: g.tags,
        });
      }
    } catch (err) {
      result.errors.push(`Seed fetch error for ${fullSeed}: ${String(err)}`);
    }
  }

  // Deduplicate by game ID (in case the same game appears under multiple seeds)
  const seen = new Map<number, CandidateGame>();
  for (const c of candidates) {
    if (!seen.has(c.id)) seen.set(c.id, c);
  }
  const sorted = [...seen.values()].sort((a, b) => {
    const ta = a.datetimeStarted ?? a.datetimeFinished ?? '';
    const tb = b.datetimeStarted ?? b.datetimeFinished ?? '';
    return ta < tb ? -1 : ta > tb ? 1 : a.id - b.id;
  });

  if (sorted.length === 0) return result;

  // ------------------------------------------------------------------
  // Step 2: build the "seen players" set from games already ingested
  // for this slot (for idempotency across runs).
  //
  // Keyed by fullSeed (e.g. "p2v0sNVC7") so that a player's appearance
  // on a 3p seed does not block them on the 2p seed of the same slot.
  // ------------------------------------------------------------------
  const alreadyIngestedIds = new Set<number>();
  const ingestedRows = await pool.query<{ hanabi_live_game_id: number }>(
    `SELECT egr.hanabi_live_game_id
     FROM event_game_results egr
     WHERE egr.stage_game_id = $1 AND egr.hanabi_live_game_id IS NOT NULL`,
    [slotId],
  );
  for (const row of ingestedRows.rows) {
    alreadyIngestedIds.add(row.hanabi_live_game_id);
  }

  // seenPlayers scoped per fullSeed (lower-cased hanab.live display names)
  const seenPlayersByFullSeed = new Map<string, Set<string>>();
  const getSeenSet = (fullSeed: string): Set<string> => {
    let s = seenPlayersByFullSeed.get(fullSeed);
    if (!s) {
      s = new Set<string>();
      seenPlayersByFullSeed.set(fullSeed, s);
    }
    return s;
  };

  // Pre-fetch exports for already-ingested games to populate the seen-player set
  for (const gameId of alreadyIngestedIds) {
    const candidate = seen.get(gameId);
    if (!candidate) continue; // not in candidate list; skip pre-population
    try {
      const exp = await fetchGameExport(gameId);
      if (exp) {
        const seenSet = getSeenSet(candidate.fullSeed);
        for (const p of exp.players) seenSet.add(p.toLowerCase());
      }
    } catch {
      // non-fatal: worst case we may double-ingest, which ON CONFLICT handles
    }
  }

  // ------------------------------------------------------------------
  // Step 3: process remaining games in chronological order.
  // ------------------------------------------------------------------
  for (const candidate of sorted) {
    if (alreadyIngestedIds.has(candidate.id)) continue;

    let exp;
    try {
      exp = await fetchGameExport(candidate.id);
    } catch (err) {
      result.errors.push(`Export fetch error for game ${candidate.id}: ${String(err)}`);
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'error:export_fetch' });
      continue;
    }
    if (!exp || exp.players.length === 0) {
      result.skipped++;
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:empty_export' });
      continue;
    }

    // Stage window enforcement: skip games played outside starts_at / ends_at.
    // Uses datetimeFinished (when the game ended) as the authoritative timestamp.
    if (stageWindow) {
      const finishedStr = exp.datetimeFinished ?? exp.datetimeStarted;
      if (!finishedStr) {
        // Cannot determine play time — skip if any window boundary is set.
        if (stageWindow.starts_at !== null || stageWindow.ends_at !== null) {
          result.skipped++;
          result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:no_timestamp' });
          continue;
        }
      } else {
        const playedAt = new Date(finishedStr);
        if (stageWindow.starts_at !== null && playedAt < stageWindow.starts_at) {
          result.skipped++;
          result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:before_window' });
          continue;
        }
        if (stageWindow.ends_at !== null && playedAt > stageWindow.ends_at) {
          result.skipped++;
          result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:after_window' });
          continue;
        }
      }
    }

    // Persist the raw export so KPIs can be recomputed locally without re-fetching.
    try {
      await persistGameExport({
        gameId: exp.gameId,
        seed: exp.seed,
        players: exp.players,
        score: exp.score,
        endCondition: exp.endCondition,
        variantId: exp.options.variantID,
        optionsJson: exp.options as Record<string, unknown>,
        datetimeStarted: exp.datetimeStarted,
        datetimeFinished: exp.datetimeFinished,
        actions: exp.actions,
        deck: exp.deck,
        tags: candidate.tags,
      });
    } catch {
      // Non-fatal: the result can still be ingested; we just won't be able to reprocess offline.
    }

    const playerNames = exp.players;
    const playerNamesLower = playerNames.map((p) => p.toLowerCase());

    // First-play-per-player check scoped to this fullSeed: if any player has
    // already appeared in a prior game on the same full seed (same team size),
    // mark all as seen and skip this game.
    const seedSet = getSeenSet(candidate.fullSeed);
    const hasRepeatPlayer = playerNamesLower.some((n) => seedSet.has(n));
    for (const n of playerNamesLower) seedSet.add(n);
    if (hasRepeatPlayer) {
      result.skipped++;
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:repeat_player' });
      continue;
    }

    // Resolve user IDs (find or create shadow users)
    let userIds: number[];
    try {
      userIds = await Promise.all(playerNames.map((name) => findOrCreateShadowUser(name)));
    } catch (err) {
      result.errors.push(`User resolution error for game ${candidate.id}: ${String(err)}`);
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'error:user_resolution' });
      continue;
    }

    // Find or create the team for this game.
    // Games whose player set doesn't exactly match a registered team are
    // attributed to a new ad-hoc team (open events).  Games where the
    // matching team already played this slot are skipped.
    let teamId: number;
    try {
      const { open, alreadyPlayed } = await findMatchingTeams(eventId, slotId, userIds);

      if (open.length === 1) {
        teamId = open[0];
      } else if (open.length > 1) {
        result.errors.push(
          `Ambiguous team for game ${candidate.id} — candidates: [${open.join(', ')}]; skipping`,
        );
        result.skipped++;
        result.gameOutcomes.push({ gameId: candidate.id, outcome: 'error:ambiguous_team' });
        continue;
      } else if (alreadyPlayed.length > 0) {
        result.skipped++;
        result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:already_played' });
        continue;
      } else {
        const violates = await wouldViolateMultiRegistration(
          eventId,
          userIds,
          userIds.length,
          eventMeta.multi_registration,
        );
        if (violates) {
          result.skipped++;
          result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:multi_registration' });
          continue;
        }
        teamId = await createIngestedEventTeam(eventId, userIds);
      }
    } catch (err) {
      result.errors.push(`Team resolution error for game ${candidate.id}: ${String(err)}`);
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'error:team_resolution' });
      continue;
    }

    // Score: use the seed-list value (authoritative from hanab.live, already 0 for
    // strikeouts/timeouts/forfeits).  The game engine is only used for KPIs (BDR,
    // strikes, clues remaining) — not for score, which the engine can occasionally
    // compute slightly differently from hanab.live's stored value.
    // As a safety net, also force score = 0 for any non-normal end condition.
    let score: number = candidate.score;
    if (exp.endCondition !== 1) score = 0;

    let bottomDeckRisk: number | null = null;
    let strikes: number | null = null;
    let cluesRemaining: number | null = null;
    const variantIdForEngine = exp.options.variantID ?? effectiveVariantId;
    if (exp.actions.length > 0 && exp.deck.length > 0) {
      try {
        const kpis = extractGameKPIs(
          variantIdForEngine,
          exp.players.length,
          exp.players,
          exp.actions,
          exp.deck,
        );
        bottomDeckRisk = kpis.bottomDeckRisk;
        strikes = kpis.strikes;
        cluesRemaining = kpis.cluesRemaining;
      } catch (engineErr) {
        // Non-fatal: KPIs will be null
        console.warn(`[ingestGameSlot] game engine error for game ${candidate.id}:`, engineErr);
      }
    }

    // Insert result
    try {
      const inserted = await insertIngestedResult(
        teamId,
        slotId,
        candidate.id,
        score,
        bottomDeckRisk,
        strikes,
        cluesRemaining,
        exp.datetimeStarted,
        exp.datetimeFinished,
        userIds,
      );
      if (inserted) {
        result.ingested++;
        result.gameOutcomes.push({ gameId: candidate.id, outcome: 'ingested' });
      } else {
        result.skipped++;
        result.gameOutcomes.push({ gameId: candidate.id, outcome: 'skipped:already_played' });
      }
    } catch (err) {
      result.errors.push(`Result insert error for game ${candidate.id}: ${String(err)}`);
      result.gameOutcomes.push({ gameId: candidate.id, outcome: 'error:result_insert' });
    }
  }

  // ------------------------------------------------------------------
  // Step 4: stamp last_replays_pulled_at on the game slot.
  // ------------------------------------------------------------------
  await pool.query(`UPDATE event_stage_games SET last_replays_pulled_at = NOW() WHERE id = $1`, [
    slotId,
  ]);

  return result;
}

// ---------------------------------------------------------------------------
// Reprocess stored exports — re-derive KPIs without hitting hanab.live.
// ---------------------------------------------------------------------------

export type ReprocessResult = {
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Re-runs the game engine against every stored hanab.live export that is
 * linked to a result row in the given event (via hanabi_live_game_id), then
 * updates bottom_deck_risk, strikes, and clues_remaining in event_game_results.
 *
 * Results with no stored export (manually submitted, or ingested before the
 * cache was introduced) are left unchanged and counted as skipped.
 */
export async function reprocessGameKPIs(eventId: number): Promise<ReprocessResult> {
  const result: ReprocessResult = { updated: 0, skipped: 0, errors: [] };

  const rows = await pool.query<{
    result_id: number;
    hanabi_live_game_id: number;
    actions: unknown;
    deck: unknown;
    players: string[];
    variant_id: number | null;
  }>(
    `SELECT egr.id          AS result_id,
            egr.hanabi_live_game_id,
            hlge.actions,
            hlge.deck,
            hlge.players,
            hlge.variant_id
     FROM event_game_results egr
     JOIN event_teams et ON et.id = egr.event_team_id
     JOIN hanabi_live_game_exports hlge ON hlge.game_id = egr.hanabi_live_game_id
     WHERE et.event_id = $1
       AND egr.hanabi_live_game_id IS NOT NULL`,
    [eventId],
  );

  for (const row of rows.rows) {
    const actions = row.actions as Array<{ type: number; target: number; value: number }>;
    const deck = row.deck as Array<{ suitIndex: number; rank: number }>;

    if (
      !Array.isArray(actions) ||
      !Array.isArray(deck) ||
      actions.length === 0 ||
      deck.length === 0
    ) {
      result.skipped++;
      continue;
    }

    try {
      const kpis = extractGameKPIs(
        row.variant_id ?? 0,
        row.players.length,
        row.players,
        actions,
        deck,
      );

      await pool.query(
        `UPDATE event_game_results
         SET bottom_deck_risk = $1, strikes = $2, clues_remaining = $3
         WHERE id = $4`,
        [kpis.bottomDeckRisk, kpis.strikes, kpis.cluesRemaining, row.result_id],
      );
      result.updated++;
    } catch (err) {
      result.errors.push(`Engine error for game ${row.hanabi_live_game_id}: ${String(err)}`);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Resolve cascading auto-pull policy: stage overrides event.
// ---------------------------------------------------------------------------

export type AutoPullPolicy = {
  enabled: boolean;
  interval_minutes: number;
};

export function resolveAutoPullPolicy(
  eventAutoPull: unknown,
  stageAutoPull: unknown,
): AutoPullPolicy | null {
  const merged = (stageAutoPull ?? eventAutoPull) as Record<string, unknown> | null | undefined;
  if (!merged || typeof merged !== 'object') return null;
  if (merged.enabled !== true) return null;
  const interval =
    typeof merged.interval_minutes === 'number' && merged.interval_minutes > 0
      ? merged.interval_minutes
      : 60;
  return { enabled: true, interval_minutes: interval };
}

// ---------------------------------------------------------------------------
// Offline ingestion — inject a pre-built GameExport, bypass hanab.live fetch.
//
// Used by simulation scripts that compose a GameExport from a stored template
// (see src/utils/game-template.ts) rather than pulling from the live API.
// The full ingestion pipeline runs as normal: shadow-user resolution, team
// finding / creation, KPI extraction via the game engine, result insert.
// ---------------------------------------------------------------------------

export type IngestFromExportResult = { ok: true } | { ok: false; reason: string };

/**
 * Ingest a single pre-built GameExport into a game slot.
 *
 * Unlike ingestGameSlot this function:
 *  - Accepts a GameExport directly (no HTTP call to hanab.live).
 *  - Does not perform first-play-per-player deduplication across games.
 *  - Does not cache the export in hanabi_live_game_exports (game ID is fake).
 *  - Does not update last_replays_pulled_at.
 */
export async function ingestFromExport(params: {
  slotId: number;
  eventId: number;
  effectiveVariantId: number;
  eventMeta: EventMeta;
  stageWindow?: StageWindow;
  gameExport: GameExport;
}): Promise<IngestFromExportResult> {
  const { slotId, eventId, effectiveVariantId, eventMeta, stageWindow, gameExport: exp } = params;

  // Registration cutoff
  const now = new Date();
  if (
    eventMeta.registration_cutoff !== null &&
    now > eventMeta.registration_cutoff &&
    !eventMeta.allow_late_registration
  ) {
    return { ok: false, reason: 'registration_closed' };
  }

  // Stage window
  if (stageWindow) {
    const finishedStr = exp.datetimeFinished ?? exp.datetimeStarted;
    if (!finishedStr) {
      if (stageWindow.starts_at !== null || stageWindow.ends_at !== null) {
        return { ok: false, reason: 'no_timestamp_window_enforced' };
      }
    } else {
      const playedAt = new Date(finishedStr);
      if (stageWindow.starts_at !== null && playedAt < stageWindow.starts_at) {
        return { ok: false, reason: 'before_window' };
      }
      if (stageWindow.ends_at !== null && playedAt > stageWindow.ends_at) {
        return { ok: false, reason: 'after_window' };
      }
    }
  }

  // Resolve shadow users from player names
  let userIds: number[];
  try {
    userIds = await Promise.all(exp.players.map((name) => findOrCreateShadowUser(name)));
  } catch (err) {
    return { ok: false, reason: `user_resolution: ${String(err)}` };
  }

  // Find or create team
  let teamId: number;
  try {
    const { open, alreadyPlayed } = await findMatchingTeams(eventId, slotId, userIds);
    if (open.length === 1) {
      teamId = open[0];
    } else if (open.length > 1) {
      return { ok: false, reason: 'ambiguous_team' };
    } else if (alreadyPlayed.length > 0) {
      return { ok: false, reason: 'already_played' };
    } else {
      const violates = await wouldViolateMultiRegistration(
        eventId,
        userIds,
        userIds.length,
        eventMeta.multi_registration,
      );
      if (violates) return { ok: false, reason: 'multi_registration_violation' };
      teamId = await createIngestedEventTeam(eventId, userIds);
    }
  } catch (err) {
    return { ok: false, reason: `team_resolution: ${String(err)}` };
  }

  // Score and KPIs: use the game engine as the authoritative source for both
  // score and KPIs. For simulation the engine score is exact; exp.score is
  // only a fallback when the engine cannot run (no deck/actions).
  let score = exp.endCondition !== 1 ? 0 : exp.score;
  let bottomDeckRisk: number | null = null;
  let strikes: number | null = null;
  let cluesRemaining: number | null = null;
  const variantIdForEngine = exp.options.variantID ?? effectiveVariantId;
  if (exp.actions.length > 0 && exp.deck.length > 0) {
    try {
      const kpis = extractGameKPIs(
        variantIdForEngine,
        exp.players.length,
        exp.players,
        exp.actions,
        exp.deck,
      );
      score = kpis.score;
      bottomDeckRisk = kpis.bottomDeckRisk;
      strikes = kpis.strikes;
      cluesRemaining = kpis.cluesRemaining;
    } catch {
      // non-fatal: KPIs remain null, score falls back to exp.score
    }
  }

  // Insert result
  try {
    const inserted = await insertIngestedResult(
      teamId,
      slotId,
      exp.gameId,
      score,
      bottomDeckRisk,
      strikes,
      cluesRemaining,
      exp.datetimeStarted,
      exp.datetimeFinished,
      userIds,
    );
    if (!inserted) return { ok: false, reason: 'already_played' };
  } catch (err) {
    return { ok: false, reason: `result_insert: ${String(err)}` };
  }

  return { ok: true };
}
