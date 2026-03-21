#!/usr/bin/env ts-node
// Replay ingestion CLI
//
// Usage:
//   npx ts-node scripts/ingest-replays.ts --event <slug> [--stage <id>] [--game <index>]
//
// Examples:
//   # Ingest all game slots for an event
//   npx ts-node scripts/ingest-replays.ts --event nvc-2025
//
//   # Ingest all game slots for a specific stage
//   npx ts-node scripts/ingest-replays.ts --event nvc-2025 --stage 42
//
//   # Ingest a single game slot (by 1-based game index)
//   npx ts-node scripts/ingest-replays.ts --event nvc-2025 --stage 42 --game 1

import 'dotenv/config';
import { pool } from '../src/config/db';
import { getEventBySlug } from '../src/modules/events/events.service';
import { listStages, getStage } from '../src/modules/stages/stages.service';
import { listGameSlots, getGameSlot } from '../src/modules/stages/games.service';
import { ingestGameSlot } from '../src/modules/ingestion/ingestion.service';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && i + 1 < args.length ? args[i + 1] : null;
  };
  return {
    eventSlug: get('--event'),
    stageId: get('--stage') ? Number(get('--stage')) : null,
    gameIndex: get('--game') ? Number(get('--game')) : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { eventSlug, stageId, gameIndex } = parseArgs();

  if (!eventSlug) {
    console.error('Error: --event <slug> is required');
    process.exit(1);
  }

  console.log(`\n[ingest] Event: ${eventSlug}`);

  const event = await getEventBySlug(eventSlug, true);
  if (!event) {
    console.error(`Error: event "${eventSlug}" not found`);
    process.exit(1);
  }

  const eventMeta = {
    registration_cutoff: event.registration_cutoff,
    allow_late_registration: event.allow_late_registration,
  };

  // Resolve which stages to process
  let stages;
  if (stageId !== null) {
    const s = await getStage(event.id, stageId);
    if (!s) {
      console.error(`Error: stage ${stageId} not found in event ${eventSlug}`);
      process.exit(1);
    }
    stages = [s];
  } else {
    stages = await listStages(event.id);
  }

  let totalIngested = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const stage of stages) {
    const stageLabel = `Stage ${stage.id} "${stage.label}"`;
    console.log(`\n[ingest]   ${stageLabel}`);

    // Resolve which game slots to process
    let slots;
    if (gameIndex !== null) {
      // gameIndex in CLI is 1-based (user-facing); game_index in DB is also 1-based now
      const slot = (await listGameSlots(stage.id)).find((s) => s.game_index + 1 === gameIndex);
      if (!slot) {
        console.warn(`    ⚠  game index ${gameIndex} not found in ${stageLabel}, skipping`);
        continue;
      }
      slots = [slot];
    } else {
      slots = await listGameSlots(stage.id);
    }

    for (const slot of slots) {
      const slotLabel = `Game ${slot.game_index + 1}${slot.nickname ? ` "${slot.nickname}"` : ''}`;

      if (!slot.effective_seed) {
        console.log(`    ${slotLabel}: no seed configured, skipping`);
        continue;
      }

      process.stdout.write(`    ${slotLabel} (seed: ${slot.effective_seed})... `);

      const result = await ingestGameSlot({
        slotId: slot.id,
        eventId: event.id,
        allowedTeamSizes: event.allowed_team_sizes,
        effectiveSeed: slot.effective_seed,
        effectiveVariantId: slot.effective_variant_id,
        eventMeta,
      });

      const summary = `ingested=${result.ingested} skipped=${result.skipped}${result.errors.length ? ` errors=${result.errors.length}` : ''}`;
      console.log(summary);

      for (const err of result.errors) {
        console.error(`      ✗ ${err}`);
        allErrors.push(`${stageLabel} / ${slotLabel}: ${err}`);
      }

      totalIngested += result.ingested;
      totalSkipped += result.skipped;
    }
  }

  console.log(
    `\n[ingest] Done. Total ingested=${totalIngested} skipped=${totalSkipped} errors=${allErrors.length}`,
  );
  if (allErrors.length > 0) {
    console.error('\nErrors:');
    for (const e of allErrors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[ingest] Fatal:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
