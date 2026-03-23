// Stage simulation service — powers the "Simulate Stage" UI feature.
//
// Two simulation modes driven by stage.participation_type:
//
//   TEAM        — generate teamsPerSize shadow teams per allowed size; each
//                 team plays every slot within the stage window.
//                 Triggered in a single step: POST /simulate
//
//   INDIVIDUAL  — two-phase flow mirroring real queued events:
//
//     Phase 1 (POST /simulate/opt-ins):
//       Shadow players opt in. Some fraction are "asleep" (z-prefix) and will
//       not actually play. The host then runs the real draw UI to assign teams.
//
//     Phase 2 (POST /simulate/games):
//       After the draw, QUEUED teams have been formed. Awake teams (all
//       members have q-prefix names) get games simulated and ingested.
//       Teams with any asleep member are skipped.
//
// Both modes write to simulation_games (IDs ≥ 9_000_000_000), then call
// ingestGameSlot() so the full production pipeline is exercised.  Only
// available when SIMULATION_MODE is true.

import { pool } from '../../config/db';
import { simulateGame } from '../../utils/simulate-game';
import { resolveSeedPayload } from '../../utils/seed.utils';
import { findOrCreateShadowUser } from '../auth/auth.service';
import { buildFullSeed } from '../../clients/hanab-live';
import { ingestGameSlot } from '../ingestion/ingestion.service';
import { buildPersonaTeams, PERSONA_NAMES } from './persona-source';
import { updateSimulationOutcomes } from './simulation.service';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIMULATION_GAME_ID_MIN = 9_000_000_000;
const GAME_DURATION_MS = 25 * 60 * 1000; // ~25 min game
const BUFFER_MS = 5 * 60 * 1000; // 5-min buffer inside window edges

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type SimulationOptions = {
  /** TEAM stages: shadow teams to generate per allowed size (default 3, min 1) */
  teamsPerSize?: number;
};

export type OptInOptions = {
  /** Total shadow players to add as opt-ins (default 8, min 2) */
  playerCount?: number;
  /**
   * Fraction of players who are "asleep" and won't be simulated after the
   * draw (0–1, default 0.2).  Asleep players use z-prefix names.
   */
  sleepFraction?: number;
};

export type SimulationSummary = {
  ingested: number;
  skipped: number;
  errors: string[];
};

export type OptInSummary = {
  awake: number;
  asleep: number;
  total: number;
};

export type SimulationStatus = {
  /** Simulated opt-ins currently in event_stage_opt_ins for this stage */
  optInCount: number;
  /** QUEUED teams in this stage that contain at least one simulation user */
  teamCount: number;
  /** Ingested simulation results for this stage */
  resultCount: number;
};

export type SimulationGameResult = {
  result_id: number | null;
  slot_id: number;
  game_index: number;
  slot_nickname: string | null;
  hanabi_live_game_id: number;
  players: string[];
  started_at: string | null;
  played_at: string | null;
  score: number | null;
  bottom_deck_risk: number | null;
  strikes: number | null;
  clues_remaining: number | null;
  team_id: number | null;
  handling: string;
};

// ---------------------------------------------------------------------------
// Internal DB helpers
// ---------------------------------------------------------------------------

type StageInfo = {
  stage_id: number;
  event_id: number;
  participation_type: string;
  starts_at: Date | null;
  ends_at: Date | null;
  allowed_team_sizes: number[];
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  multi_registration: string;
};

type SlotRow = {
  slot_id: number;
  game_index: number;
  raw_seed_formula: string | null;
  effective_variant_id: number;
};

async function fetchStageInfo(stageId: number): Promise<StageInfo | null> {
  const row = await pool.query<StageInfo>(
    `SELECT
       s.id                        AS stage_id,
       e.id                        AS event_id,
       s.participation_type,
       s.starts_at,
       s.ends_at,
       e.allowed_team_sizes,
       e.registration_cutoff,
       e.allow_late_registration,
       e.multi_registration
     FROM event_stages s
     JOIN events e ON e.id = s.event_id
     WHERE s.id = $1`,
    [stageId],
  );
  return row.rows[0] ?? null;
}

async function fetchSlotsWithSeed(stageId: number): Promise<SlotRow[]> {
  const rows = await pool.query<SlotRow>(
    `SELECT
       g.id                          AS slot_id,
       g.game_index,
       COALESCE(
         g.seed_payload,
         s.seed_rule_json->>'formula',
         e.seed_rule_json->>'formula'
       )                             AS raw_seed_formula,
       COALESCE(
         CASE WHEN g.variant_id IS NOT NULL THEN g.variant_id END,
         CASE WHEN s.variant_rule_json->>'type' = 'none'     THEN 0
              WHEN s.variant_rule_json->>'type' = 'specific'
                THEN (s.variant_rule_json->>'variantId')::int END,
         CASE WHEN e.variant_rule_json->>'type' = 'none'     THEN 0
              WHEN e.variant_rule_json->>'type' = 'specific'
                THEN (e.variant_rule_json->>'variantId')::int END,
         0
       )                             AS effective_variant_id
     FROM event_stage_games g
     JOIN event_stages s ON s.id = g.stage_id
     JOIN events e ON e.id = s.event_id
     WHERE g.stage_id = $1
       AND COALESCE(
             g.seed_payload,
             s.seed_rule_json->>'formula',
             e.seed_rule_json->>'formula'
           ) IS NOT NULL
     ORDER BY g.game_index`,
    [stageId],
  );
  return rows.rows;
}

// ---------------------------------------------------------------------------
// Player name generation
//
// TEAM stages use Greek Mythology persona names (drawn from persona-source.ts
// groups) so simulated teams look like real teams.
//
// INDIVIDUAL/QUEUED stages continue to use per-stage keyed names:
//   sim-s{id}-q{n:04d}  — awake opt-in player
//   sim-s{id}-z{n:04d}  — asleep opt-in player (skipped after draw)
// ---------------------------------------------------------------------------

function awakePlayerName(stageId: number, idx: number): string {
  return `sim-s${stageId}-q${String(idx).padStart(4, '0')}`;
}

function asleepPlayerName(stageId: number, idx: number): string {
  return `sim-s${stageId}-z${String(idx).padStart(4, '0')}`;
}

function isAsleepName(stageId: number, displayName: string): boolean {
  return displayName.startsWith(`sim-s${stageId}-z`);
}

function isSimulationName(stageId: number, displayName: string): boolean {
  return displayName.startsWith(`sim-s${stageId}-`);
}

// ---------------------------------------------------------------------------
// Completion rate
//
// Per-team participation is sampled from a mixture:
//   70% of teams: 90–100% slot completion (high attendance)
//   20% of teams: 50–90%  (some misses)
//   10% of teams: 5–50%   (inconsistent)
// ---------------------------------------------------------------------------

function sampleCompletionRate(): number {
  const r = Math.random();
  if (r < 0.7) return 0.9 + Math.random() * 0.1;
  if (r < 0.9) return 0.5 + Math.random() * 0.4;
  return 0.05 + Math.random() * 0.45;
}

// ---------------------------------------------------------------------------
// Adversarial game generation
//
// After normal team games are created for a slot, we insert a small set of
// intentionally-invalid games to exercise the ingestion rejection paths:
//
//   before_window  — finished 1 h before stage.starts_at
//   after_window   — finished 1 h after stage.ends_at
//   repeat_player  — two games that share a player (second hits repeat_player)
//
// Adversarial players use the prefix "sim-adv-{slotId}-{tag}" so they are
// clearly distinguishable in the results table.
// ---------------------------------------------------------------------------

async function addAdversarialGamesForSlot(
  slot: SlotRow,
  startsAt: Date | null,
  endsAt: Date | null,
  windowStart: Date,
  windowEnd: Date,
  teamSize: number,
  effectiveSeed: string,
): Promise<void> {
  const fullSeed = buildFullSeed(teamSize, slot.effective_variant_id, effectiveSeed);
  const slotId = slot.slot_id;

  function advName(tag: string, idx: number): string {
    return `sim-adv-${slotId}-${tag}-${idx}`;
  }
  function ts(ms: number): { playedAt: string; startedAt: string } {
    return {
      playedAt: new Date(ms).toISOString(),
      startedAt: new Date(ms - GAME_DURATION_MS).toISOString(),
    };
  }

  // 1. Before-window: finished 1 h before stage opens
  if (startsAt !== null) {
    const { playedAt, startedAt } = ts(startsAt.getTime() - 60 * 60_000);
    const players = Array.from({ length: teamSize }, (_, i) => advName('bw', i));
    await simulateGame({ fullSeed, players, playedAt, startedAt, slotId });
  }

  // 2. After-window: finished 1 h after stage closes
  if (endsAt !== null) {
    const { playedAt, startedAt } = ts(endsAt.getTime() + 60 * 60_000);
    const players = Array.from({ length: teamSize }, (_, i) => advName('aw', i));
    await simulateGame({ fullSeed, players, playedAt, startedAt, slotId });
  }

  // 3. Repeat player: two games sharing player rp-0.
  //    Game R1 (earlier) gets ingested. Game R2 (later, shares rp-0) hits repeat_player.
  //    Timestamps are near the end of the window so they sort after all normal games.
  const rp1Ms = windowEnd.getTime() - 12 * 60_000;
  const rp2Ms = windowEnd.getTime() - 6 * 60_000;
  const rpPlayers1 = Array.from({ length: teamSize }, (_, i) => advName('rp', i));
  // rp-0 repeats; the rest are unique new players
  const rpPlayers2 = [advName('rp', 0), ...Array.from({ length: teamSize - 1 }, (_, i) => advName('rp', teamSize + i))];

  await simulateGame({ fullSeed, players: rpPlayers1, ...ts(rp1Ms), slotId });
  await simulateGame({ fullSeed, players: rpPlayers2, ...ts(rp2Ms), slotId });
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

function makeTimestamps(
  windowStart: Date,
  windowEnd: Date,
  count: number,
  slotOffset = 0,
): Array<{ playedAt: string; startedAt: string }> {
  const span = Math.max(windowEnd.getTime() - windowStart.getTime(), count * 30 * 60_000);
  const step = span / (count + 1);
  return Array.from({ length: count }, (_, i) => {
    const finishedMs = windowStart.getTime() + step * (i + 1) + slotOffset;
    return {
      playedAt: new Date(finishedMs).toISOString(),
      startedAt: new Date(finishedMs - GAME_DURATION_MS).toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// TEAM simulation (single-step)
// ---------------------------------------------------------------------------

async function simulateTeamStage(
  stage: StageInfo,
  slots: SlotRow[],
  teamsPerSize: number,
): Promise<SimulationSummary> {
  const { allowed_team_sizes: sizes } = stage;

  const windowStart =
    stage.starts_at != null
      ? new Date(stage.starts_at.getTime() + BUFFER_MS)
      : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd =
    stage.ends_at != null
      ? new Date(stage.ends_at.getTime() - BUFFER_MS)
      : new Date(Date.now() - 60 * 60 * 1000);

  const teamsBySize: string[][][] = sizes.map((teamSize) =>
    buildPersonaTeams(teamSize, teamsPerSize),
  );

  await Promise.all(
    teamsBySize.flat(2).map((name) => findOrCreateShadowUser(name)),
  );

  // Per-team completion rates — each team has a consistent participation level
  // across all slots (70% high, 20% moderate, 10% low).
  const completionRates: number[][] = sizes.map(() =>
    Array.from({ length: teamsPerSize }, () => sampleCompletionRate()),
  );

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: stage.event_id,
      stageId: stage.stage_id,
      gameIndex: slot.game_index,
    });

    for (let si = 0; si < sizes.length; si++) {
      const teamSize = sizes[si];
      const fullSeed = buildFullSeed(teamSize, slot.effective_variant_id, effectiveSeed);
      const timestamps = makeTimestamps(windowStart, windowEnd, teamsPerSize, slotIdx * 120_000);

      for (let ti = 0; ti < teamsPerSize; ti++) {
        if (Math.random() > completionRates[si][ti]) continue;
        const players = teamsBySize[si][ti];
        const { playedAt, startedAt } = timestamps[ti];
        await simulateGame({ fullSeed, players, playedAt, startedAt, slotId: slot.slot_id });
      }
    }

    // Adversarial games: exercise before_window, after_window, and repeat_player
    // rejection paths for the first allowed team size.
    await addAdversarialGamesForSlot(
      slot,
      stage.starts_at,
      stage.ends_at,
      windowStart,
      windowEnd,
      sizes[0],
      effectiveSeed,
    );
  }

  return ingestAllSlots(stage, slots);
}

// ---------------------------------------------------------------------------
// INDIVIDUAL/QUEUED simulation — phase 1: populate opt-ins
// ---------------------------------------------------------------------------

export async function populateSimulatedOptIns(
  stageId: number,
  options: OptInOptions = {},
): Promise<OptInSummary> {
  const stage = await fetchStageInfo(stageId);
  if (!stage) throw new Error(`Stage ${stageId} not found`);
  if (stage.participation_type !== 'INDIVIDUAL') {
    throw new Error('populateSimulatedOptIns is only valid for INDIVIDUAL stages');
  }

  const playerCount = Math.max(2, options.playerCount ?? 8);
  const sleepFraction = Math.min(1, Math.max(0, options.sleepFraction ?? 0.2));

  const asleepCount = Math.floor(playerCount * sleepFraction);
  const awakeCount = playerCount - asleepCount;

  // Build player name lists
  const awakeNames = Array.from({ length: awakeCount }, (_, i) => awakePlayerName(stageId, i));
  const asleepNames = Array.from({ length: asleepCount }, (_, i) => asleepPlayerName(stageId, i));
  const allNames = [...awakeNames, ...asleepNames];

  // Ensure shadow users exist
  const userIds = await Promise.all(allNames.map(findOrCreateShadowUser));
  const nameToId = new Map(allNames.map((n, i) => [n, userIds[i]]));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Register all players at event level (required for opt-in)
    for (const uid of userIds) {
      await client.query(
        `INSERT INTO event_registrations (event_id, user_id, status)
         VALUES ($1, $2, 'ACTIVE')
         ON CONFLICT (event_id, user_id) DO UPDATE
           SET status = CASE
             WHEN event_registrations.status = 'WITHDRAWN' THEN 'ACTIVE'
             ELSE event_registrations.status
           END`,
        [stage.event_id, uid],
      );
    }

    // Upsert opt-in records (idempotent — skip if already exists)
    for (const name of allNames) {
      const uid = nameToId.get(name)!;
      await client.query(
        `INSERT INTO event_stage_opt_ins (stage_id, user_id, partner_user_id)
         VALUES ($1, $2, NULL)
         ON CONFLICT (stage_id, user_id) DO NOTHING`,
        [stageId, uid],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { awake: awakeCount, asleep: asleepCount, total: playerCount };
}

// ---------------------------------------------------------------------------
// INDIVIDUAL/QUEUED simulation — phase 2: simulate games for awake teams
// ---------------------------------------------------------------------------

export async function simulateQueuedGames(stageId: number): Promise<SimulationSummary> {
  const stage = await fetchStageInfo(stageId);
  if (!stage) throw new Error(`Stage ${stageId} not found`);
  if (stage.participation_type !== 'INDIVIDUAL') {
    throw new Error('simulateQueuedGames is only valid for INDIVIDUAL stages');
  }

  const slots = await fetchSlotsWithSeed(stageId);
  if (slots.length === 0) {
    return { ingested: 0, skipped: 0, errors: ['Stage has no game slots with a seed formula'] };
  }

  // Fetch all QUEUED teams and their members' display names
  const teamsResult = await pool.query<{ team_id: number; display_names: string[] }>(
    `SELECT
       et.id AS team_id,
       array_agg(u.display_name ORDER BY u.display_name) AS display_names
     FROM event_teams et
     JOIN event_team_members etm ON etm.event_team_id = et.id
     JOIN users u ON u.id = etm.user_id
     WHERE et.stage_id = $1 AND et.source = 'QUEUED'
     GROUP BY et.id`,
    [stageId],
  );

  if (teamsResult.rows.length === 0) {
    return {
      ingested: 0,
      skipped: 0,
      errors: ['No QUEUED teams found — run the draw first'],
    };
  }

  // Split into awake (all members have awake/team names) vs asleep (any member has z-prefix)
  const awakeTeams = teamsResult.rows.filter(
    (t) => !t.display_names.some((name) => isAsleepName(stageId, name)),
  );

  if (awakeTeams.length === 0) {
    return {
      ingested: 0,
      skipped: teamsResult.rows.length,
      errors: ['All QUEUED teams contain asleep players — no games to simulate'],
    };
  }

  const windowStart =
    stage.starts_at != null
      ? new Date(stage.starts_at.getTime() + BUFFER_MS)
      : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const windowEnd =
    stage.ends_at != null
      ? new Date(stage.ends_at.getTime() - BUFFER_MS)
      : new Date(Date.now() - 60 * 60 * 1000);

  for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
    const slot = slots[slotIdx];
    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: stage.event_id,
      stageId: stage.stage_id,
      gameIndex: slot.game_index,
    });

    const timestamps = makeTimestamps(windowStart, windowEnd, awakeTeams.length, slotIdx * 120_000);

    for (let ti = 0; ti < awakeTeams.length; ti++) {
      const team = awakeTeams[ti];
      const teamSize = team.display_names.length;
      const fullSeed = buildFullSeed(teamSize, slot.effective_variant_id, effectiveSeed);
      const { playedAt, startedAt } = timestamps[ti];
      await simulateGame({ fullSeed, players: team.display_names, playedAt, startedAt, slotId: slot.slot_id });
    }
  }

  return ingestAllSlots(stage, slots);
}

// ---------------------------------------------------------------------------
// Shared ingestion loop
// ---------------------------------------------------------------------------

async function ingestAllSlots(stage: StageInfo, slots: SlotRow[]): Promise<SimulationSummary> {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  const eventMeta = {
    registration_cutoff: stage.registration_cutoff,
    allow_late_registration: stage.allow_late_registration,
    multi_registration: stage.multi_registration,
  };
  const stageWindow = { starts_at: stage.starts_at, ends_at: stage.ends_at };

  for (const slot of slots) {
    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: stage.event_id,
      stageId: stage.stage_id,
      gameIndex: slot.game_index,
    });

    const result = await ingestGameSlot({
      slotId: slot.slot_id,
      eventId: stage.event_id,
      allowedTeamSizes: stage.allowed_team_sizes,
      effectiveSeed,
      effectiveVariantId: slot.effective_variant_id,
      eventMeta,
      stageWindow,
    });

    ingested += result.ingested;
    skipped += result.skipped;
    errors.push(...result.errors);
    await updateSimulationOutcomes(result.gameOutcomes);
  }

  return { ingested, skipped, errors };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full simulation for a TEAM stage: write fake games to simulation_games,
 * then ingest them via the normal production pipeline.
 * For INDIVIDUAL stages, use populateSimulatedOptIns + simulateQueuedGames.
 */
export async function runStageSimulation(
  stageId: number,
  options: SimulationOptions = {},
): Promise<SimulationSummary> {
  const stage = await fetchStageInfo(stageId);
  if (!stage) throw new Error(`Stage ${stageId} not found`);

  if (stage.participation_type === 'INDIVIDUAL') {
    throw new Error(
      'INDIVIDUAL stages use a two-phase simulation: POST /simulate/opt-ins then POST /simulate/games',
    );
  }

  const slots = await fetchSlotsWithSeed(stageId);
  if (slots.length === 0) {
    return { ingested: 0, skipped: 0, errors: ['Stage has no game slots with a seed formula'] };
  }

  if (stage.allowed_team_sizes.length === 0) {
    return { ingested: 0, skipped: 0, errors: ['Event has no allowed team sizes configured'] };
  }

  const teamsPerSize = Math.max(1, options.teamsPerSize ?? 3);
  return simulateTeamStage(stage, slots, teamsPerSize);
}

/**
 * Return simulation status for a stage: opt-in count, team count, result count.
 */
export async function getSimulationStatus(stageId: number): Promise<SimulationStatus> {
  const [optInsResult, teamsResult, resultsResult] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM event_stage_opt_ins eso
       JOIN users u ON u.id = eso.user_id
       WHERE eso.stage_id = $1 AND u.display_name LIKE $2`,
      [stageId, `sim-s${stageId}-%`],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT et.id) AS count
       FROM event_teams et
       JOIN event_team_members etm ON etm.event_team_id = et.id
       JOIN users u ON u.id = etm.user_id
       WHERE et.stage_id = $1 AND et.source = 'QUEUED'
         AND u.display_name LIKE $2`,
      [stageId, `sim-s${stageId}-%`],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       WHERE esg.stage_id = $1 AND egr.hanabi_live_game_id >= $2`,
      [stageId, SIMULATION_GAME_ID_MIN],
    ),
  ]);

  return {
    optInCount: Number(optInsResult.rows[0].count),
    teamCount: Number(teamsResult.rows[0].count),
    resultCount: Number(resultsResult.rows[0].count),
  };
}

/**
 * Return all simulation games for this stage — both ingested and rejected/skipped —
 * identified by hanabi_live_game_id >= 9,000,000,000.
 *
 * Ingested games come from event_game_results.
 * Non-ingested games come from simulation_games rows that have a slot_id
 * pointing to a game slot in this stage and an ingest_outcome that is not
 * 'ingested'.
 */
export async function getStageSimulationResults(stageId: number): Promise<SimulationGameResult[]> {
  const rows = await pool.query<{
    result_id: string | null;
    slot_id: string;
    game_index: number;
    slot_nickname: string | null;
    hanabi_live_game_id: string;
    players: string[];
    started_at: Date | null;
    played_at: Date | null;
    score: number | null;
    bottom_deck_risk: number | null;
    strikes: number | null;
    clues_remaining: number | null;
    team_id: string | null;
    handling: string;
  }>(
    `-- Arm 1: ingested simulation games
     SELECT
       egr.id                                        AS result_id,
       esg.id                                        AS slot_id,
       esg.game_index,
       esg.nickname                                  AS slot_nickname,
       egr.hanabi_live_game_id,
       array_agg(u.display_name ORDER BY u.display_name) AS players,
       egr.started_at,
       egr.played_at,
       egr.score,
       egr.bottom_deck_risk,
       egr.strikes,
       egr.clues_remaining,
       egr.event_team_id                             AS team_id,
       COALESCE(sg.ingest_outcome, 'ingested')       AS handling
     FROM event_game_results egr
     JOIN event_stage_games esg ON esg.id = egr.stage_game_id
     JOIN event_teams et ON et.id = egr.event_team_id
     JOIN event_team_members etm ON etm.event_team_id = et.id
     JOIN users u ON u.id = etm.user_id
     LEFT JOIN simulation_games sg ON sg.id = egr.hanabi_live_game_id
     WHERE esg.stage_id = $1
       AND egr.hanabi_live_game_id >= $2
       AND egr.attempt_id IS NULL
     GROUP BY egr.id, esg.id, esg.game_index, esg.nickname, egr.event_team_id, sg.ingest_outcome

     UNION ALL

     -- Arm 2: non-ingested simulation games (have slot_id, outcome set, not 'ingested')
     SELECT
       NULL                                          AS result_id,
       sg.slot_id                                    AS slot_id,
       esg.game_index,
       esg.nickname                                  AS slot_nickname,
       sg.id                                         AS hanabi_live_game_id,
       sg.players,
       sg.datetime_started                           AS started_at,
       sg.datetime_finished                          AS played_at,
       NULL::integer                                 AS score,
       NULL::numeric                                 AS bottom_deck_risk,
       NULL::integer                                 AS strikes,
       NULL::integer                                 AS clues_remaining,
       NULL::bigint                                  AS team_id,
       sg.ingest_outcome                             AS handling
     FROM simulation_games sg
     JOIN event_stage_games esg ON esg.id = sg.slot_id
     WHERE esg.stage_id = $1
       AND sg.id >= $2
       AND sg.ingest_outcome IS NOT NULL
       AND sg.ingest_outcome != 'ingested'

     ORDER BY game_index, played_at`,
    [stageId, SIMULATION_GAME_ID_MIN],
  );

  return rows.rows.map((r) => ({
    result_id: r.result_id !== null ? Number(r.result_id) : null,
    slot_id: Number(r.slot_id),
    game_index: r.game_index,
    slot_nickname: r.slot_nickname,
    hanabi_live_game_id: Number(r.hanabi_live_game_id),
    players: r.players,
    started_at: r.started_at?.toISOString() ?? null,
    played_at: r.played_at?.toISOString() ?? null,
    score: r.score,
    bottom_deck_risk: r.bottom_deck_risk,
    strikes: r.strikes,
    clues_remaining: r.clues_remaining,
    team_id: r.team_id !== null ? Number(r.team_id) : null,
    handling: r.handling,
  }));
}

/**
 * Delete all simulation data for this stage:
 *  - Ingested game results + participants
 *  - QUEUED teams created by simulation
 *  - Simulated opt-in records
 *
 * Allows a clean re-run from phase 1.
 */
export async function clearStageSimulationResults(
  stageId: number,
): Promise<{ deleted: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find result IDs to delete
    const resultIds = await client.query<{ id: number }>(
      `SELECT egr.id
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       WHERE esg.stage_id = $1 AND egr.hanabi_live_game_id >= $2`,
      [stageId, SIMULATION_GAME_ID_MIN],
    );

    const ids = resultIds.rows.map((r) => r.id);

    if (ids.length > 0) {
      await client.query(
        `DELETE FROM event_game_result_participants WHERE game_result_id = ANY($1)`,
        [ids],
      );
      await client.query(`DELETE FROM event_game_results WHERE id = ANY($1)`, [ids]);
    }

    // Remove QUEUED teams created for this stage by simulation (INDIVIDUAL stages)
    await client.query(
      `DELETE FROM event_teams WHERE stage_id = $1 AND source = 'QUEUED'`,
      [stageId],
    );

    // Remove all-shadow-user teams for this stage (covers persona teams and sim-adv-* teams).
    // Shadow users have password_hash IS NULL; real users always have a password.
    await client.query(
      `DELETE FROM event_teams WHERE stage_id = $1 AND id IN (
         SELECT et.id FROM event_teams et
         WHERE et.stage_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM event_team_members etm
             JOIN users u ON u.id = etm.user_id
             WHERE etm.event_team_id = et.id
               AND u.password_hash IS NOT NULL
           )
       )`,
      [stageId],
    );

    // Remove simulation_games rows linked to slots of this stage so stale
    // adversarial / rejected rows don't persist across clear-and-re-run cycles.
    await client.query(
      `DELETE FROM simulation_games WHERE slot_id IN (
         SELECT id FROM event_stage_games WHERE stage_id = $1
       )`,
      [stageId],
    );

    // Remove simulated opt-in records
    await client.query(
      `DELETE FROM event_stage_opt_ins eso
       USING users u
       WHERE eso.stage_id = $1
         AND eso.user_id = u.id
         AND u.display_name LIKE $2`,
      [stageId, `sim-s${stageId}-%`],
    );

    await client.query('COMMIT');
    return { deleted: ids.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Re-export for use by the CLI script
export { isSimulationName, isAsleepName, awakePlayerName, asleepPlayerName, PERSONA_NAMES };
