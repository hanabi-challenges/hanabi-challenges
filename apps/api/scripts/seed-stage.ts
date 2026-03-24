#!/usr/bin/env tsx
// Simulate all game slots for a single stage.
//
// For each slot × allowed team size, writes `--teams` simulated games to the
// simulation_games table (via simulateGame()), then immediately ingests them
// via ingestGameSlot() so the results are visible in the DB.
//
// Coverage strategy
// -----------------
// 1. All team sizes — every value in event.allowed_team_sizes gets its own
//    batch of games for every slot, hitting all full-seed combinations.
//
// 2. First-play-per-player deduplication — teams alternate between fresh
//    players (will be ingested) and repeat-player teams (will be rejected by
//    ingestGameSlot's dedup logic), so both code paths are exercised:
//
//      team 0: [p0, p1]       → fresh  → INGESTED
//      team 1: [p0, p2]       → p0 repeat → SKIPPED
//      team 2: [p3, p4]       → fresh  → INGESTED
//      team 3: [p3, p5]       → p3 repeat → SKIPPED
//
// 3. Time spread — games are placed at 30-minute intervals starting from
//    stage.starts_at (or 2 weeks ago if no window is set), with the last
//    game landing before stage.ends_at.
//
// 4. Player isolation — names use sim-s{stageId}-{n:04d} keyed per
//    (slot, size) pair so different pairs never share players, keeping
//    multi-registration policy out of the picture for cross-slot games.
//    Names are stable across re-runs; shadow users are reused.
//
// Usage
// -----
//   SIMULATION_MODE=true DATABASE_URL=... pnpm tsx scripts/seed-stage.ts \
//     --stage 5 [--teams 4] [--write-only] [--dry-run]
//
//   --stage      stage id (required)
//   --teams      teams per slot per team size (default: 4, min: 2)
//   --write-only write to simulation_games but skip ingestion
//   --dry-run    print plan without writing or ingesting anything

import { pool } from '../src/config/db';
import { buildFullSeed } from '../src/clients/hanab-live';
import { simulateGame } from '../src/utils/simulate-game';
import { ingestGameSlot } from '../src/modules/ingestion/ingestion.service';
import { resolveSeedPayload } from '../src/utils/seed.utils';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  const stageIdStr = get('--stage');
  if (!stageIdStr || isNaN(Number(stageIdStr))) {
    console.error('Usage: seed-stage.ts --stage <stageId> [--teams N] [--write-only] [--dry-run]');
    process.exit(1);
  }

  const teamsRaw = Number(get('--teams') ?? 4);
  const teamsPerSlot = Math.max(2, Number.isInteger(teamsRaw) ? teamsRaw : 4);

  return {
    stageId: Number(stageIdStr),
    teamsPerSlot,
    writeOnly: has('--write-only'),
    dryRun: has('--dry-run'),
  };
}

// ---------------------------------------------------------------------------
// DB queries
// ---------------------------------------------------------------------------

type SlotRow = {
  slot_id: number;
  game_index: number;
  raw_seed_formula: string | null;
  effective_variant_id: number;
};

type StageInfo = {
  stage_id: number;
  event_id: number;
  stage_mechanism: string;
  starts_at: Date | null;
  ends_at: Date | null;
  allowed_team_sizes: number[];
  registration_cutoff: Date | null;
  allow_late_registration: boolean;
  multi_registration: string;
};

async function fetchStageInfo(stageId: number): Promise<StageInfo | null> {
  const row = await pool.query<StageInfo>(
    `SELECT
       s.id                        AS stage_id,
       e.id                        AS event_id,
       s.stage_mechanism,
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

async function fetchSlots(stageId: number): Promise<SlotRow[]> {
  // Mirrors the seed/variant resolution in replay-pull.worker.ts, without the
  // auto-pull or scheduling filters — we want ALL slots for the stage.
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
     ORDER BY g.game_index`,
    [stageId],
  );
  return rows.rows;
}

// ---------------------------------------------------------------------------
// Player name generation
// ---------------------------------------------------------------------------

// Players are named sim-s{stageId}-{counter:04d}.  Within each (slot, size)
// pair, we allocate a block of IDs so pairs never share players.
// Block size = teamsPerSlot * teamSize * 2  (generous headroom).
function makePlayerBlock(
  stageId: number,
  slotIndex: number,
  sizeIndex: number,
  numSizes: number,
  teamsPerSlot: number,
  teamSize: number,
): string[] {
  // Each (slot, size) pair gets its own section of the ID namespace.
  const pairIndex = slotIndex * numSizes + sizeIndex;
  const blockSize = teamsPerSlot * teamSize * 2;
  const base = pairIndex * blockSize;

  // Generate enough unique player IDs for teamsPerSlot teams, including the
  // "shared" dedup players used by odd-indexed teams.
  const ids: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    ids.push(base + i);
  }
  return ids.map((n) => `sim-s${stageId}-${String(n).padStart(4, '0')}`);
}

// For team index t within a (slot, size) pair, return the player list using
// the coverage pattern:
//   even t → fresh players (will be ingested)
//   odd  t → player[0] from team t-1 + fresh remaining (will be skipped)
function playersForTeam(allPlayers: string[], teamIndex: number, teamSize: number): string[] {
  if (teamIndex % 2 === 0) {
    // Fresh block: teamIndex/2 * teamSize ... + teamSize
    const freshBase = (teamIndex / 2) * teamSize;
    return allPlayers.slice(freshBase, freshBase + teamSize);
  } else {
    // Repeat pattern: share player[0] with the preceding even team, then fresh
    const prevEvenBase = ((teamIndex - 1) / 2) * teamSize;
    const repeatPlayer = allPlayers[prevEvenBase]; // the "anchor" repeat player
    // Fresh fill: pull from the high part of the block to avoid overlap
    const freshFillBase = Math.ceil(allPlayers.length / 2) + teamIndex * (teamSize - 1);
    const freshFill = allPlayers.slice(freshFillBase, freshFillBase + teamSize - 1);
    return [repeatPlayer, ...freshFill];
  }
}

// ---------------------------------------------------------------------------
// Time distribution
// ---------------------------------------------------------------------------

const INTERVAL_MS = 30 * 60 * 1000; // 30 minutes between games
const WINDOW_BUFFER_MS = 5 * 60 * 1000; // 5-minute buffer inside window edges

function makeTimestamps(
  stageWindow: { starts_at: Date | null; ends_at: Date | null },
  totalGames: number,
): Array<{ playedAt: string; startedAt: string }> {
  const fallbackBase = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago
  const base =
    stageWindow.starts_at != null
      ? new Date(stageWindow.starts_at.getTime() + WINDOW_BUFFER_MS)
      : fallbackBase;

  // Ensure games don't exceed the end of the window
  const ceiling =
    stageWindow.ends_at != null ? new Date(stageWindow.ends_at.getTime() - WINDOW_BUFFER_MS) : null;

  return Array.from({ length: totalGames }, (_, i) => {
    let finishedMs = base.getTime() + i * INTERVAL_MS;
    if (ceiling !== null && finishedMs > ceiling.getTime()) {
      // Compress remaining games into the last 30 minutes before ceiling
      finishedMs = ceiling.getTime() - (totalGames - 1 - i) * 60_000;
    }
    const playedAt = new Date(finishedMs).toISOString();
    const startedAt = new Date(finishedMs - 25 * 60_000).toISOString(); // ~25 min game
    return { playedAt, startedAt };
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { stageId, teamsPerSlot, writeOnly, dryRun } = parseArgs();

  if (dryRun) console.log('[dry-run] No writes or ingestion will occur.\n');

  // ── 1. Fetch stage + slot data ──────────────────────────────────────────
  const stage = await fetchStageInfo(stageId);
  if (!stage) {
    console.error(`Stage ${stageId} not found.`);
    process.exit(1);
  }

  const slots = await fetchSlots(stageId);
  if (slots.length === 0) {
    console.error(`Stage ${stageId} has no game slots.`);
    process.exit(1);
  }

  const slotsWithSeed = slots.filter((s) => s.raw_seed_formula != null);
  if (slotsWithSeed.length === 0) {
    console.error(`Stage ${stageId} has no slots with a seed formula configured.`);
    process.exit(1);
  }

  const { allowed_team_sizes: sizes } = stage;

  console.log(`\nStage ${stageId} (${stage.stage_mechanism}), event ${stage.event_id}`);
  console.log(
    `  window : ${stage.starts_at?.toISOString() ?? 'none'} → ${stage.ends_at?.toISOString() ?? 'none'}`,
  );
  console.log(`  sizes  : [${sizes.join(', ')}]`);
  console.log(
    `  slots  : ${slotsWithSeed.length} with seed (${slots.length - slotsWithSeed.length} without)`,
  );
  console.log(`  teams  : ${teamsPerSlot} per slot per size`);
  console.log(
    `  expect : ~${Math.ceil(teamsPerSlot / 2)} ingested + ~${Math.floor(teamsPerSlot / 2)} skipped per (slot × size)\n`,
  );

  // ── 2. Write simulation games ───────────────────────────────────────────
  type IngestTarget = {
    slot: SlotRow;
    effectiveSeed: string;
  };

  const ingestTargets: IngestTarget[] = [];
  let totalWritten = 0;
  let skippedNoSeed = 0;

  for (let slotIndex = 0; slotIndex < slotsWithSeed.length; slotIndex++) {
    const slot = slotsWithSeed[slotIndex];

    const effectiveSeed = resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: stage.event_id,
      stageId: stage.stage_id,
      gameIndex: slot.game_index,
    });

    if (!effectiveSeed) {
      console.log(`  slot ${slot.slot_id} (game ${slot.game_index}): no effective seed — skipping`);
      skippedNoSeed++;
      continue;
    }

    // Pre-compute timestamps for all games across all sizes in this slot
    const totalGamesThisSlot = sizes.length * teamsPerSlot;
    const timestamps = makeTimestamps(
      { starts_at: stage.starts_at, ends_at: stage.ends_at },
      totalGamesThisSlot,
    );

    let gameCounter = 0;
    console.log(`  slot ${slot.slot_id} (game ${slot.game_index}, seed suffix: ${effectiveSeed})`);

    for (let sizeIndex = 0; sizeIndex < sizes.length; sizeIndex++) {
      const teamSize = sizes[sizeIndex];
      const fullSeed = buildFullSeed(teamSize, slot.effective_variant_id, effectiveSeed);
      const allPlayers = makePlayerBlock(
        stageId,
        slotIndex,
        sizeIndex,
        sizes.length,
        teamsPerSlot,
        teamSize,
      );

      process.stdout.write(`    ${teamSize}p (${fullSeed}): `);

      for (let t = 0; t < teamsPerSlot; t++) {
        const players = playersForTeam(allPlayers, t, teamSize);
        const { playedAt, startedAt } = timestamps[gameCounter++];
        const expectedOutcome = t % 2 === 0 ? 'ingest' : 'skip';

        if (!dryRun) {
          await simulateGame({ fullSeed, players, playedAt, startedAt });
        }

        process.stdout.write(`[${expectedOutcome}] `);
        totalWritten++;
      }
      console.log();
    }

    ingestTargets.push({ slot, effectiveSeed });
  }

  if (skippedNoSeed > 0) {
    console.log(`\n  (${skippedNoSeed} slot(s) skipped — no seed formula configured)`);
  }

  console.log(
    `\nWrote ${dryRun ? '(dry-run) ' : ''}${totalWritten} game(s) to simulation_games.\n`,
  );

  if (writeOnly || dryRun) {
    console.log('Skipping ingestion (--write-only or --dry-run).');
    await pool.end();
    return;
  }

  // ── 3. Ingest ───────────────────────────────────────────────────────────
  console.log('Ingesting...\n');

  let totalIngested = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const { slot, effectiveSeed } of ingestTargets) {
    const result = await ingestGameSlot({
      slotId: slot.slot_id,
      eventId: stage.event_id,
      allowedTeamSizes: sizes,
      effectiveSeed,
      effectiveVariantId: slot.effective_variant_id,
      eventMeta: {
        registration_cutoff: stage.registration_cutoff,
        allow_late_registration: stage.allow_late_registration,
        multi_registration: stage.multi_registration,
      },
      stageWindow: {
        starts_at: stage.starts_at,
        ends_at: stage.ends_at,
      },
    });

    totalIngested += result.ingested;
    totalSkipped += result.skipped;
    allErrors.push(...result.errors);

    const errorTag = result.errors.length > 0 ? ` ⚠ ${result.errors.length} error(s)` : '';
    console.log(
      `  slot ${slot.slot_id}: ingested=${result.ingested} skipped=${result.skipped}${errorTag}`,
    );
    for (const e of result.errors) console.log(`    ✗ ${e}`);
  }

  // ── 4. Summary ──────────────────────────────────────────────────────────
  const expectedIngested = ingestTargets.length * sizes.length * Math.ceil(teamsPerSlot / 2);
  const expectedSkipped = ingestTargets.length * sizes.length * Math.floor(teamsPerSlot / 2);

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  slots processed : ${ingestTargets.length}`);
  console.log(`  written         : ${totalWritten}`);
  console.log(`  ingested        : ${totalIngested} (expected ~${expectedIngested})`);
  console.log(`  skipped         : ${totalSkipped} (expected ~${expectedSkipped})`);
  console.log(`  errors          : ${allErrors.length}`);
  if (allErrors.length > 0) {
    console.log('\nErrors:');
    for (const e of allErrors) console.log(`  ✗ ${e}`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[seed-stage] Fatal:', err);
  process.exit(1);
});
