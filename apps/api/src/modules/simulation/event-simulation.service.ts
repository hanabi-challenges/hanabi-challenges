// Event simulation service — simulates all TEAM stages of an event in one pass.
//
// Shadow teams are keyed to the event (sim-e{eventId}-t*) so the same teams
// carry across all stages.  Only TEAM stages are simulated; INDIVIDUAL stages
// are skipped.
//
// Only available when SIMULATION_MODE is true.

import { pool } from '../../config/db';
import { simulateGame } from '../../utils/simulate-game';
import { resolveSeedPayload } from '../../utils/seed.utils';
import { findOrCreateShadowUser } from '../auth/auth.service';
import { buildFullSeed } from '../../clients/hanab-live';
import { ingestGameSlot } from '../ingestion/ingestion.service';
import { buildPersonaTeams } from './persona-source';
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

export type EventSimulationOptions = {
  teamsPerSize?: number;
};

export type EventSimulationSummary = {
  ingested: number;
  skipped: number;
  errors: string[];
  stagesSimulated: number;
};

export type EventSimulationGameResult = {
  result_id: number | null;
  stage_id: number;
  stage_label: string;
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
// Internal types
// ---------------------------------------------------------------------------

type EventInfo = {
  id: number;
  allowed_team_sizes: number[];
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  multi_registration: string;
};

type StageSlotRow = {
  stage_id: number;
  stage_label: string;
  starts_at: Date | null;
  ends_at: Date | null;
  participation_type: string;
  slot_id: number;
  game_index: number;
  raw_seed_formula: string | null;
  effective_variant_id: number;
};

// ---------------------------------------------------------------------------
// Completion rate — same mixture as stage-simulation.service.ts
// ---------------------------------------------------------------------------

function sampleCompletionRate(): number {
  const r = Math.random();
  if (r < 0.7) return 0.9 + Math.random() * 0.1;
  if (r < 0.9) return 0.5 + Math.random() * 0.4;
  return 0.05 + Math.random() * 0.45;
}

// ---------------------------------------------------------------------------
// Adversarial game generation — mirrors stage-simulation.service.ts
// ---------------------------------------------------------------------------

const GAME_DURATION_MS_ADV = 25 * 60 * 1000;

async function addAdversarialGamesForSlot(
  slot: StageSlotRow,
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
      startedAt: new Date(ms - GAME_DURATION_MS_ADV).toISOString(),
    };
  }

  if (startsAt !== null) {
    const { playedAt, startedAt } = ts(startsAt.getTime() - 60 * 60_000);
    const players = Array.from({ length: teamSize }, (_, i) => advName('bw', i));
    await simulateGame({ fullSeed, players, playedAt, startedAt, slotId });
  }

  if (endsAt !== null) {
    const { playedAt, startedAt } = ts(endsAt.getTime() + 60 * 60_000);
    const players = Array.from({ length: teamSize }, (_, i) => advName('aw', i));
    await simulateGame({ fullSeed, players, playedAt, startedAt, slotId });
  }

  const rp1Ms = windowEnd.getTime() - 12 * 60_000;
  const rp2Ms = windowEnd.getTime() - 6 * 60_000;
  const rpPlayers1 = Array.from({ length: teamSize }, (_, i) => advName('rp', i));
  const rpPlayers2 = [
    advName('rp', 0),
    ...Array.from({ length: teamSize - 1 }, (_, i) => advName('rp', teamSize + i)),
  ];

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
// DB helpers
// ---------------------------------------------------------------------------

async function fetchEventBySlug(slug: string): Promise<EventInfo | null> {
  const row = await pool.query<EventInfo>(
    `SELECT id, allowed_team_sizes, registration_cutoff, allow_late_registration, multi_registration
     FROM events WHERE slug = $1`,
    [slug],
  );
  return row.rows[0] ?? null;
}

async function fetchAllStageSlots(slug: string): Promise<StageSlotRow[]> {
  const rows = await pool.query<StageSlotRow>(
    `SELECT
       s.id                        AS stage_id,
       s.label                     AS stage_label,
       s.starts_at,
       s.ends_at,
       s.participation_type,
       g.id                        AS slot_id,
       g.game_index,
       COALESCE(
         g.seed_payload,
         s.seed_rule_json->>'formula',
         e.seed_rule_json->>'formula'
       )                           AS raw_seed_formula,
       COALESCE(
         CASE WHEN g.variant_id IS NOT NULL THEN g.variant_id END,
         CASE WHEN s.variant_rule_json->>'type' = 'none'     THEN 0
              WHEN s.variant_rule_json->>'type' = 'specific'
                THEN (s.variant_rule_json->>'variantId')::int END,
         CASE WHEN e.variant_rule_json->>'type' = 'none'     THEN 0
              WHEN e.variant_rule_json->>'type' = 'specific'
                THEN (e.variant_rule_json->>'variantId')::int END,
         0
       )                           AS effective_variant_id
     FROM event_stage_games g
     JOIN event_stages s ON s.id = g.stage_id
     JOIN events e ON e.id = s.event_id
     WHERE e.slug = $1
       AND s.participation_type = 'TEAM'
       AND COALESCE(g.seed_payload, s.seed_rule_json->>'formula', e.seed_rule_json->>'formula') IS NOT NULL
     ORDER BY s.id, g.game_index`,
    [slug],
  );
  return rows.rows;
}

// ---------------------------------------------------------------------------
// Ingestion loop (per stage)
// ---------------------------------------------------------------------------

async function ingestStageSlots(
  event: EventInfo,
  stageId: number,
  startsAt: Date | null,
  endsAt: Date | null,
  slots: StageSlotRow[],
): Promise<{ ingested: number; skipped: number; errors: string[] }> {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  const eventMeta = {
    registration_cutoff: event.registration_cutoff,
    allow_late_registration: event.allow_late_registration,
    multi_registration: event.multi_registration,
  };
  const stageWindow = { starts_at: startsAt, ends_at: endsAt };

  for (const slot of slots) {
    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: event.id,
      stageId,
      gameIndex: slot.game_index,
    });

    const result = await ingestGameSlot({
      slotId: slot.slot_id,
      eventId: event.id,
      allowedTeamSizes: event.allowed_team_sizes,
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
 * Run a full event-level simulation: same shadow teams play across all TEAM
 * stages. Shadow users are keyed to the event (sim-e{eventId}-t*).
 */
export async function runEventSimulation(
  eventSlug: string,
  options: EventSimulationOptions = {},
): Promise<EventSimulationSummary> {
  const event = await fetchEventBySlug(eventSlug);
  if (!event) throw new Error(`Event "${eventSlug}" not found`);

  if (event.allowed_team_sizes.length === 0) {
    return {
      ingested: 0,
      skipped: 0,
      errors: ['Event has no allowed team sizes configured'],
      stagesSimulated: 0,
    };
  }

  const allSlots = await fetchAllStageSlots(eventSlug);

  // Group slots by stage_id
  const slotsByStage = new Map<number, StageSlotRow[]>();
  for (const slot of allSlots) {
    const existing = slotsByStage.get(slot.stage_id) ?? [];
    existing.push(slot);
    slotsByStage.set(slot.stage_id, existing);
  }

  // Collect stages that have at least one slot
  const stageIds = [...slotsByStage.keys()];
  if (stageIds.length === 0) {
    return {
      ingested: 0,
      skipped: 0,
      errors: ['No TEAM stages with game slots found for this event'],
      stagesSimulated: 0,
    };
  }

  const sizes = event.allowed_team_sizes;
  const teamsPerSize = Math.max(1, options.teamsPerSize ?? 3);

  // Build persona teams — same teams carry across all stages
  const teamsBySize: string[][][] = sizes.map((teamSize) =>
    buildPersonaTeams(teamSize, teamsPerSize),
  );

  // Create shadow users (idempotent)
  await Promise.all(teamsBySize.flat(2).map((name) => findOrCreateShadowUser(name)));

  // Per-team completion rates assigned once — same team participates (or not)
  // consistently across all stages, mimicking real-world attendance patterns.
  const completionRates: number[][] = sizes.map(() =>
    Array.from({ length: teamsPerSize }, () => sampleCompletionRate()),
  );

  let totalIngested = 0;
  let totalSkipped = 0;
  const totalErrors: string[] = [];
  let stagesSimulated = 0;

  for (const stageId of stageIds) {
    const slots = slotsByStage.get(stageId)!;
    const firstSlot = slots[0];
    const stageLabel = firstSlot.stage_label;

    const startsAt = firstSlot.starts_at;
    const endsAt = firstSlot.ends_at;

    const windowStart =
      startsAt != null
        ? new Date(startsAt.getTime() + BUFFER_MS)
        : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const windowEnd =
      endsAt != null
        ? new Date(endsAt.getTime() - BUFFER_MS)
        : new Date(Date.now() - 60 * 60 * 1000);

    // Simulate games for each slot × size × team
    for (let slotIdx = 0; slotIdx < slots.length; slotIdx++) {
      const slot = slots[slotIdx];
      const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
        eventId: event.id,
        stageId,
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
      await addAdversarialGamesForSlot(
        slot,
        startsAt,
        endsAt,
        windowStart,
        windowEnd,
        sizes[0],
        effectiveSeed,
      );
    }

    // Ingest all slots for this stage
    const result = await ingestStageSlots(event, stageId, startsAt, endsAt, slots);
    totalIngested += result.ingested;
    totalSkipped += result.skipped;
    if (result.errors.length > 0) {
      totalErrors.push(...result.errors.map((e) => `[${stageLabel}] ${e}`));
    }
    stagesSimulated++;
  }

  return {
    ingested: totalIngested,
    skipped: totalSkipped,
    errors: totalErrors,
    stagesSimulated,
  };
}

/**
 * Return all simulation games across all TEAM stages of this event —
 * both ingested and rejected/skipped — identified by game_id >= 9,000,000,000.
 */
export async function getEventSimulationResults(
  eventSlug: string,
): Promise<EventSimulationGameResult[]> {
  const rows = await pool.query<{
    result_id: string | null;
    stage_id: string;
    stage_label: string;
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
       s.id                                          AS stage_id,
       s.label                                       AS stage_label,
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
     JOIN event_stages s ON s.id = esg.stage_id
     JOIN events e ON e.id = s.event_id
     JOIN event_teams et ON et.id = egr.event_team_id
     JOIN event_team_members etm ON etm.event_team_id = et.id
     JOIN users u ON u.id = etm.user_id
     LEFT JOIN simulation_games sg ON sg.id = egr.hanabi_live_game_id
     WHERE e.slug = $1
       AND s.participation_type = 'TEAM'
       AND egr.hanabi_live_game_id >= $2
       AND egr.attempt_id IS NULL
     GROUP BY egr.id, s.id, s.label, esg.id, esg.game_index, esg.nickname, egr.event_team_id, sg.ingest_outcome

     UNION ALL

     -- Arm 2: non-ingested simulation games
     SELECT
       NULL                                          AS result_id,
       s.id                                          AS stage_id,
       s.label                                       AS stage_label,
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
     JOIN event_stages s ON s.id = esg.stage_id
     JOIN events e ON e.id = s.event_id
     WHERE e.slug = $1
       AND s.participation_type = 'TEAM'
       AND sg.id >= $2
       AND sg.ingest_outcome IS NOT NULL
       AND sg.ingest_outcome != 'ingested'

     ORDER BY stage_label, game_index, played_at`,
    [eventSlug, SIMULATION_GAME_ID_MIN],
  );

  return rows.rows.map((r) => ({
    result_id: r.result_id !== null ? Number(r.result_id) : null,
    stage_id: Number(r.stage_id),
    stage_label: r.stage_label,
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
 * Delete all event-level simulation data:
 *  - Ingested game results + participants for all TEAM stages of this event
 *  - Event teams whose ALL members have sim-e{eventId}-* display names
 *  - Opt-in records for sim-e{eventId}-* users
 */
export async function clearEventSimulationResults(eventSlug: string): Promise<{ deleted: number }> {
  const event = await fetchEventBySlug(eventSlug);
  if (!event) throw new Error(`Event "${eventSlug}" not found`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find result IDs to delete (across all TEAM stages of this event)
    const resultIds = await client.query<{ id: number }>(
      `SELECT egr.id
       FROM event_game_results egr
       JOIN event_stage_games esg ON esg.id = egr.stage_game_id
       JOIN event_stages s ON s.id = esg.stage_id
       JOIN events e ON e.id = s.event_id
       WHERE e.slug = $1
         AND s.participation_type = 'TEAM'
         AND egr.hanabi_live_game_id >= $2`,
      [eventSlug, SIMULATION_GAME_ID_MIN],
    );

    const ids = resultIds.rows.map((r) => r.id);

    if (ids.length > 0) {
      await client.query(
        `DELETE FROM event_game_result_participants WHERE game_result_id = ANY($1)`,
        [ids],
      );
      await client.query(`DELETE FROM event_game_results WHERE id = ANY($1)`, [ids]);
    }

    // Delete all-shadow-user teams for this event (covers persona teams and sim-adv-* teams).
    await client.query(
      `DELETE FROM event_teams WHERE id IN (
         SELECT et.id FROM event_teams et
         WHERE et.event_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM event_team_members etm
             JOIN users u ON u.id = etm.user_id
             WHERE etm.event_team_id = et.id
               AND u.password_hash IS NOT NULL
           )
       )`,
      [event.id],
    );

    // Remove simulation_games rows for all TEAM stage slots so adversarial /
    // rejected rows don't persist across clear-and-re-run cycles.
    await client.query(
      `DELETE FROM simulation_games WHERE slot_id IN (
         SELECT g.id FROM event_stage_games g
         JOIN event_stages s ON s.id = g.stage_id
         WHERE s.event_id = $1 AND s.participation_type = 'TEAM'
       )`,
      [event.id],
    );

    // Delete opt-ins for shadow users (defensive — TEAM stages have no opt-ins)
    await client.query(
      `DELETE FROM event_stage_opt_ins eso
       USING users u
       WHERE eso.user_id = u.id
         AND u.password_hash IS NULL
         AND eso.stage_id IN (
           SELECT s.id FROM event_stages s WHERE s.event_id = $1
         )`,
      [event.id],
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
