#!/usr/bin/env tsx
// One-time script to pull and anonymize No Variant game templates from hanab.live.
//
// For each player count (2–6) and seed suffix (1–20), fetches the first game
// played on that seed, strips all identifying information (players, game ID,
// timestamps, seed string), and retains only the deck and action sequence.
//
// Output: apps/api/fixtures/no-variant-templates.json
//
// Usage:
//   pnpm tsx scripts/pull-game-templates.ts

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fetchGamesBySeed, fetchGameExport } from '../src/clients/hanab-live';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PLAYER_COUNTS = [2, 3, 4, 5, 6];
const SEED_COUNT = 20;
const OUTPUT_PATH = path.resolve(__dirname, '../fixtures/no-variant-templates.json');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GameTemplate = {
  playerCount: number;
  score: number;
  endCondition: number;
  // Only options fields the engine uses are preserved; players/seed/timestamps stripped.
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
// Main
// ---------------------------------------------------------------------------

async function main() {
  const templates: GameTemplate[] = [];

  for (const n of PLAYER_COUNTS) {
    console.log(`\n── ${n}-player games ──`);
    let collected = 0;

    for (let i = 1; i <= SEED_COUNT; i++) {
      const fullSeed = `p${n}v0s${i}`;
      process.stdout.write(`  ${fullSeed} ... `);

      try {
        const games = await fetchGamesBySeed(fullSeed);
        if (games.length === 0) {
          console.log('no games found');
          continue;
        }

        const exp = await fetchGameExport(games[0].id);
        if (!exp) {
          console.log('export not available');
          continue;
        }
        if (exp.deck.length === 0 || exp.actions.length === 0) {
          console.log('export missing deck/actions');
          continue;
        }

        templates.push({
          playerCount: n,
          score: exp.score,
          endCondition: exp.endCondition,
          options: {
            variantID: exp.options.variantID,
            cardCycle: exp.options.cardCycle,
            deckPlays: exp.options.deckPlays,
            emptyClues: exp.options.emptyClues,
            oneExtraCard: exp.options.oneExtraCard,
            oneLessCard: exp.options.oneLessCard,
            allOrNothing: exp.options.allOrNothing,
            detrimentalCharacters: exp.options.detrimentalCharacters,
          },
          deck: exp.deck,
          actions: exp.actions,
        });

        collected++;
        console.log(
          `score=${exp.score} endCondition=${exp.endCondition} actions=${exp.actions.length} ✓`,
        );
      } catch (err) {
        console.log(`error: ${String(err)}`);
      }
    }

    console.log(`  → ${collected} template(s) collected`);
  }

  // Ensure the output directory exists
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(templates, null, 2));

  const summary = PLAYER_COUNTS.map(
    (n) => `${n}p: ${templates.filter((t) => t.playerCount === n).length}`,
  ).join(', ');
  console.log(`\nSaved ${templates.length} template(s) — ${summary}`);
  console.log(`Output: ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[pull-game-templates] Fatal:', err);
  process.exit(1);
});
