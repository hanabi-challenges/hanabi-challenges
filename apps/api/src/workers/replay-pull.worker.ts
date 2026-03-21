// Replay pull background worker.
//
// On every tick (default: every 60 seconds) this worker queries for game slots
// whose auto-pull policy is enabled and whose next scheduled pull time has
// arrived.  "Next pull time" = last_replays_pulled_at + interval_minutes (or
// immediately if never pulled).
//
// Auto-pull policy cascades: stage overrides event.  If neither level has a
// policy, the slot is skipped.

import { pool } from '../config/db';
import { ingestGameSlot, resolveAutoPullPolicy } from '../modules/ingestion/ingestion.service';
import { resolveSeedPayload } from '../utils/seed.utils';
import { info, warn } from '../utils/logger';

const WORKER_TICK_MS = 60_000; // check every minute

type PendingSlot = {
  slot_id: number;
  stage_id: number;
  game_index: number;
  event_id: number;
  allowed_team_sizes: number[];
  raw_seed_formula: string;
  effective_variant_id: number;
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  event_auto_pull: unknown;
  stage_auto_pull: unknown;
  multi_registration: string;
};

async function fetchPendingSlots(): Promise<PendingSlot[]> {
  // We only pull slots that have an effective seed configured.
  // The effective_seed resolution mirrors games.service.ts but done in SQL
  // for the scheduler query so we don't have to load every slot into TS.
  const result = await pool.query<PendingSlot>(`
    SELECT
      g.id                           AS slot_id,
      g.stage_id,
      g.game_index,
      e.id                           AS event_id,
      e.allowed_team_sizes,
      COALESCE(
        g.seed_payload,
        s.seed_rule_json->>'formula',
        e.seed_rule_json->>'formula'
      )                              AS raw_seed_formula,
      COALESCE(
        CASE WHEN g.variant_id IS NOT NULL THEN g.variant_id END,
        CASE WHEN s.variant_rule_json->>'type' = 'none' THEN 0
             WHEN s.variant_rule_json->>'type' = 'specific'
               THEN (s.variant_rule_json->>'variantId')::int END,
        CASE WHEN e.variant_rule_json->>'type' = 'none' THEN 0
             WHEN e.variant_rule_json->>'type' = 'specific'
               THEN (e.variant_rule_json->>'variantId')::int END,
        0
      )                              AS effective_variant_id,
      e.registration_cutoff,
      e.allow_late_registration,
      e.auto_pull_json               AS event_auto_pull,
      s.auto_pull_json               AS stage_auto_pull,
      e.multi_registration
    FROM event_stage_games g
    JOIN event_stages s ON s.id = g.stage_id
    JOIN events e ON e.id = s.event_id
    WHERE
      -- At least one level must have auto_pull enabled
      COALESCE(
        s.auto_pull_json,
        e.auto_pull_json
      )->>'enabled' = 'true'
      -- Only slots with a seed formula configured
      AND COALESCE(
        g.seed_payload,
        s.seed_rule_json->>'formula',
        e.seed_rule_json->>'formula'
      ) IS NOT NULL
      -- Due for a pull: never pulled, or interval has elapsed
      AND (
        g.last_replays_pulled_at IS NULL
        OR g.last_replays_pulled_at + (
          COALESCE(
            s.auto_pull_json,
            e.auto_pull_json
          )->>'interval_minutes'
        )::int * INTERVAL '1 minute' <= NOW()
      )
  `);
  return result.rows;
}

async function tick() {
  let slots: PendingSlot[];
  try {
    slots = await fetchPendingSlots();
  } catch (err) {
    warn('[replay-pull] Failed to fetch pending slots:', err);
    return;
  }

  if (slots.length === 0) return;

  info(`[replay-pull] Processing ${slots.length} slot(s)`);

  for (const slot of slots) {
    const policy = resolveAutoPullPolicy(slot.event_auto_pull, slot.stage_auto_pull);
    if (!policy?.enabled) continue;

    // Resolve seed formula tokens ({eID}, {sID}, {gID}, etc.) using the same
    // utility as the service layer, so formula-based seeds work correctly.
    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula, {
      eventId: slot.event_id,
      stageId: slot.stage_id,
      gameIndex: slot.game_index,
    });
    if (!effectiveSeed) continue;

    try {
      const result = await ingestGameSlot({
        slotId: slot.slot_id,
        eventId: slot.event_id,
        allowedTeamSizes: slot.allowed_team_sizes,
        effectiveSeed,
        effectiveVariantId: slot.effective_variant_id,
        eventMeta: {
          registration_cutoff: slot.registration_cutoff,
          allow_late_registration: slot.allow_late_registration,
          multi_registration: slot.multi_registration,
        },
      });

      if (result.ingested > 0 || result.errors.length > 0) {
        info(
          `[replay-pull] slot=${slot.slot_id} ingested=${result.ingested} skipped=${result.skipped} errors=${result.errors.length}`,
        );
        for (const e of result.errors) warn(`[replay-pull]   ✗ ${e}`);
      }
    } catch (err) {
      warn(`[replay-pull] slot=${slot.slot_id} fatal:`, err);
    }
  }
}

export function startReplayPullWorker(): void {
  info('[replay-pull] Worker started');
  // First tick after a short delay so the server finishes starting up
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), WORKER_TICK_MS);
  }, 5_000);
}
