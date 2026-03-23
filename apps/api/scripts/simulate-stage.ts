#!/usr/bin/env tsx
// Realistic stage simulation script.
//
// Simulates N compliant teams (each playing every slot), then appends targeted
// edge-case games that exercise every enforcement path in ingestGameSlot:
//
//   ✓ Compliant teams    — each team × each slot → INGEST
//   ✗ Repeat player      — new team shares a player with compliant team 0 → SKIP
//   ✗ Duplicate play     — compliant team 0 replays slot 0 (later timestamp) → SKIP
//   ✗ Before-window      — game finished 1 hr before starts_at → SKIP
//   ✗ After-window       — game finished 1 hr after ends_at → SKIP
//   ✗ Multi-reg          — intruder team includes a pre-registered ghost player → SKIP
//
// Architecture
// ------------
// Starts an inline mock hanab-live HTTP server (random port) backed by the
// simulation_games table.  Sets HANAB_LIVE_BASE_URL before dynamically
// importing ingestGameSlot so the production pipeline hits the local mock,
// not hanab.live.  No separately-running API server is required.
//
// Usage
// -----
//   DATABASE_URL=... pnpm tsx scripts/simulate-stage.ts \
//     --stage 5 [--teams 3] [--dry-run]
//
//   --stage    stage id (required)
//   --teams    compliant teams per size (default: 3, min: 1)
//   --dry-run  print plan without writing or ingesting

import express from 'express';
import type { Server } from 'node:http';
import { pool } from '../src/config/db';
import { simulateGame } from '../src/utils/simulate-game';
import { resolveSeedPayload } from '../src/utils/seed.utils';
import { findOrCreateShadowUser } from '../src/modules/auth/auth.service';
import {
  getSimulatedGamesBySeed,
  getSimulatedGameById,
} from '../src/modules/simulation/simulation.service';

// ---------------------------------------------------------------------------
// Inline helper — avoids importing hanab-live at module load time so that
// HANAB_LIVE_BASE_URL can be set before the client module is first required.
// ---------------------------------------------------------------------------

const buildFullSeed = (n: number, v: number, suffix: string) => `p${n}v${v}s${suffix}`;

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
    console.error('Usage: simulate-stage.ts --stage <stageId> [--teams N] [--dry-run]');
    process.exit(1);
  }

  const teamsRaw = Number(get('--teams') ?? 3);
  const teamsPerSize = Math.max(1, Number.isInteger(teamsRaw) ? teamsRaw : 3);

  return {
    stageId: Number(stageIdStr),
    teamsPerSize,
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
  attempt_policy: string;
  config_json: Record<string, unknown>;
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
       s.attempt_policy,
       s.config_json,
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
// Inline mock hanab-live server
//
// Serves the same contract as mock-hanab.routes.ts but bound to a random
// ephemeral port, so the script works without a running API server.
// ---------------------------------------------------------------------------

function startMockServer(): Promise<{ server: Server; port: number }> {
  const app = express();

  app.get('/api/v1/seed/:fullSeed', async (req, res) => {
    const fullSeed = String(req.params.fullSeed);
    const sizeParam = Array.isArray(req.query.size)
      ? req.query.size[0]
      : (req.query.size ?? '100');
    const pageParam = Array.isArray(req.query.page)
      ? req.query.page[0]
      : (req.query.page ?? '0');
    const size = Math.min(Math.max(parseInt(String(sizeParam), 10) || 100, 1), 100);
    const page = Math.max(parseInt(String(pageParam), 10) || 0, 0);

    const { totalRows, rows } = await getSimulatedGamesBySeed(fullSeed, page, size);
    res.json({
      total_rows: totalRows,
      rows: rows.map((r) => ({
        id: r.id,
        score: r.score,
        numPlayers: r.players.length,
        datetimeStarted: r.datetime_started?.toISOString() ?? null,
        datetimeFinished: r.datetime_finished?.toISOString() ?? null,
        tags: '',
      })),
    });
  });

  app.get('/export/:gameId', async (req, res) => {
    const gameId = parseInt(String(req.params.gameId), 10);
    if (!Number.isFinite(gameId)) return res.status(400).json({ error: 'Invalid gameId' });

    const game = await getSimulatedGameById(gameId);
    if (!game) return res.status(404).json({ error: 'Not found' });

    res.json({
      id: game.id,
      players: game.players,
      seed: game.full_seed,
      endCondition: game.end_condition,
      options: game.options_json,
      datetimeStarted: game.datetime_started?.toISOString() ?? null,
      datetimeFinished: game.datetime_finished?.toISOString() ?? null,
      actions: game.actions,
      deck: game.deck,
      // score deliberately absent — matches real hanab.live export endpoint
    });
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Could not determine server port'));
        return;
      }
      resolve({ server, port: addr.port });
    });
    server.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Player name generation
//
// Compliant: sim-s{stageId}-{n:04d}   (stable across re-runs)
// Edge:      sim-s{stageId}-e{n:03d}  (stable across re-runs)
//
// Counter starts at 0 each run; shadow users are reused if already present.
// ---------------------------------------------------------------------------

let compliantCounter = 0;
let edgeCounter = 0;

function nextCompliant(stageId: number): string {
  return `sim-s${stageId}-${String(compliantCounter++).padStart(4, '0')}`;
}

function nextEdge(stageId: number): string {
  return `sim-s${stageId}-e${String(edgeCounter++).padStart(3, '0')}`;
}

function makePlayers(stageId: number, count: number, edge = false): string[] {
  return Array.from({ length: count }, () => (edge ? nextEdge(stageId) : nextCompliant(stageId)));
}

// ---------------------------------------------------------------------------
// Timestamp generation
//
// Games are spaced 30 minutes apart starting from windowStart.
// Each call to nextTimestamp() advances a shared global clock.
// ---------------------------------------------------------------------------

const INTERVAL_MS = 30 * 60 * 1000;
const GAME_DURATION_MS = 25 * 60 * 1000;

let clockMs = 0; // set in main() after windowStart is known

function nextTimestamp(): { playedAt: string; startedAt: string } {
  clockMs += INTERVAL_MS;
  const playedAt = new Date(clockMs).toISOString();
  const startedAt = new Date(clockMs - GAME_DURATION_MS).toISOString();
  return { playedAt, startedAt };
}

// ---------------------------------------------------------------------------
// Pre-registration helper (creates ghost teams for multi-reg edge case)
// ---------------------------------------------------------------------------

async function preRegisterTeam(eventId: number, userIds: number[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

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

// ---------------------------------------------------------------------------
// Game plan types
// ---------------------------------------------------------------------------

type GameEntry = {
  slot: SlotRow;
  fullSeed: string;
  players: string[];
  playedAt: string;
  startedAt: string;
  expected: 'INGEST' | 'SKIP';
  reason: string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { stageId, teamsPerSize, dryRun } = parseArgs();

  if (dryRun) console.log('[dry-run] No writes or ingestion will occur.\n');

  // ── 1. Fetch stage + slot data ──────────────────────────────────────────
  const stage = await fetchStageInfo(stageId);
  if (!stage) {
    console.error(`Stage ${stageId} not found.`);
    process.exit(1);
  }

  const slots = await fetchSlots(stageId);
  const slotsWithSeed = slots.filter((s) => s.raw_seed_formula != null);

  if (slotsWithSeed.length === 0) {
    console.error(`Stage ${stageId} has no slots with a seed formula configured.`);
    process.exit(1);
  }

  const { allowed_team_sizes: sizes } = stage;
  const primarySize = sizes[0];

  // Determine simulation window
  const BUFFER_MS = 5 * 60 * 1000;
  const now = Date.now();
  const windowStart =
    stage.starts_at != null
      ? new Date(stage.starts_at.getTime() + BUFFER_MS)
      : new Date(now - 14 * 24 * 60 * 60 * 1000);
  const windowEnd =
    stage.ends_at != null
      ? new Date(stage.ends_at.getTime() - BUFFER_MS)
      : new Date(now - 60 * 60 * 1000);

  if (windowEnd <= windowStart) {
    console.error('Stage window is too narrow or inverted — cannot place compliant games.');
    process.exit(1);
  }

  // Detect which edge cases are applicable
  const hasStartsBoundary = stage.starts_at !== null;
  const hasEndsBoundary = stage.ends_at !== null;
  const hasMultiRegRestriction =
    stage.multi_registration === 'ONE' || stage.multi_registration === 'ONE_PER_SIZE';
  // Multi-reg violation requires teamSize ≥ 2 (otherwise intruder = ghost team → INGEST)
  const canTestMultiReg = hasMultiRegRestriction && primarySize >= 2;

  const bestOfN =
    stage.attempt_policy === 'BEST_OF_N'
      ? ((stage.config_json?.best_of as number) ?? null)
      : null;

  console.log(`\nStage ${stageId} (${stage.stage_mechanism}), event ${stage.event_id}`);
  console.log(
    `  window      : ${stage.starts_at?.toISOString() ?? 'none'} → ${stage.ends_at?.toISOString() ?? 'none'}`,
  );
  console.log(`  sizes       : [${sizes.join(', ')}]`);
  console.log(`  slots       : ${slotsWithSeed.length} (${slots.length - slotsWithSeed.length} without seed)`);
  console.log(`  policy      : ${stage.attempt_policy}${bestOfN !== null ? ` (best ${bestOfN} of ${slotsWithSeed.length})` : ''}`);
  console.log(`  multi_reg   : ${stage.multi_registration}`);
  console.log(`  teams       : ${teamsPerSize} compliant per size\n`);

  console.log('Edge cases:');
  console.log(`  repeat_player   : always`);
  console.log(`  duplicate_play  : always`);
  console.log(`  before_window   : ${hasStartsBoundary ? 'yes' : 'no (no starts_at)'}`);
  console.log(`  after_window    : ${hasEndsBoundary ? 'yes' : 'no (no ends_at)'}`);
  console.log(
    `  multi_reg      : ${canTestMultiReg ? 'yes' : hasMultiRegRestriction ? 'skipped (primarySize=1)' : 'no (UNRESTRICTED)'}`,
  );
  console.log();

  // ── 2. Start mock server ────────────────────────────────────────────────
  if (!dryRun) {
    const { server, port } = await startMockServer();
    process.env.HANAB_LIVE_BASE_URL = `http://127.0.0.1:${port}`;
    console.log(`[mock] hanab-live server → http://127.0.0.1:${port}\n`);

    process.on('exit', () => server.close());
    process.on('SIGINT', () => {
      server.close();
      process.exit(0);
    });
  }

  // ── 3. Dynamic import ingestGameSlot ────────────────────────────────────
  // Must come after HANAB_LIVE_BASE_URL is set so hanab-live.ts captures
  // the correct BASE at module initialisation time.
  const { ingestGameSlot } = await import('../src/modules/ingestion/ingestion.service');

  const eventMeta = {
    registration_cutoff: stage.registration_cutoff,
    allow_late_registration: stage.allow_late_registration,
    multi_registration: stage.multi_registration,
  };
  const stageWindow = { starts_at: stage.starts_at, ends_at: stage.ends_at };

  // ── 4. Pre-register ghost team (multi-reg edge setup) ───────────────────
  let ghostPlayers: string[] = [];
  if (!dryRun && canTestMultiReg) {
    ghostPlayers = makePlayers(stageId, primarySize, true);
    const ghostIds = await Promise.all(ghostPlayers.map(findOrCreateShadowUser));
    await preRegisterTeam(stage.event_id, ghostIds);
    console.log(`[setup] Ghost team registered: [${ghostPlayers.join(', ')}]\n`);
  } else if (canTestMultiReg) {
    ghostPlayers = makePlayers(stageId, primarySize, true);
    console.log(`[dry-run] Would register ghost team: [${ghostPlayers.join(', ')}]\n`);
  }

  // ── 5. Build game plan ──────────────────────────────────────────────────
  // Clock starts at windowStart so all compliant games land inside the window.
  clockMs = windowStart.getTime();

  const gamePlan: GameEntry[] = [];

  // Compliant teams: N teams per size.  Each team plays every slot.
  // Teams are keyed (sizeIdx, teamIdx) → player list, built once and reused
  // across all slots so the same players represent the same team everywhere.
  const compliantTeams: Map<string, string[]> = new Map();
  for (let si = 0; si < sizes.length; si++) {
    for (let ti = 0; ti < teamsPerSize; ti++) {
      const key = `${si}:${ti}`;
      compliantTeams.set(key, makePlayers(stageId, sizes[si]));
    }
  }

  // Resolve effective seeds for all slots upfront
  const resolvedSlots = slotsWithSeed.map((slot) => ({
    slot,
    effectiveSeed: resolveSeedPayload(slot.raw_seed_formula!, {
      eventId: stage.event_id,
      stageId: stage.stage_id,
      gameIndex: slot.game_index,
    }),
  }));

  // Compliant games: slot × size × team → INGEST
  for (const { slot, effectiveSeed } of resolvedSlots) {
    for (let si = 0; si < sizes.length; si++) {
      const teamSize = sizes[si];
      const fullSeed = buildFullSeed(teamSize, slot.effective_variant_id, effectiveSeed);

      for (let ti = 0; ti < teamsPerSize; ti++) {
        const players = compliantTeams.get(`${si}:${ti}`)!;
        const { playedAt, startedAt } = nextTimestamp();
        gamePlan.push({ slot, fullSeed, players, playedAt, startedAt, expected: 'INGEST', reason: 'compliant' });
      }
    }
  }

  // Edge games — all use the primary size and first slot
  const { slot: slot0, effectiveSeed: seed0 } = resolvedSlots[0];
  const fullSeed0 = buildFullSeed(primarySize, slot0.effective_variant_id, seed0);
  const anchorTeam = compliantTeams.get('0:0')!; // first compliant team for primary size

  // Repeat player: shares player[0] of anchorTeam, fresh rest → first-play dedup
  {
    const freshRest = makePlayers(stageId, primarySize - 1, true);
    const players = [anchorTeam[0], ...freshRest];
    // Timestamp after all compliant games to ensure anchor is processed first
    const { playedAt, startedAt } = nextTimestamp();
    gamePlan.push({ slot: slot0, fullSeed: fullSeed0, players, playedAt, startedAt, expected: 'SKIP', reason: 'repeat_player' });
  }

  // Duplicate play: anchorTeam replays slot0 at a later time → first-play dedup
  {
    const { playedAt, startedAt } = nextTimestamp();
    gamePlan.push({ slot: slot0, fullSeed: fullSeed0, players: anchorTeam, playedAt, startedAt, expected: 'SKIP', reason: 'duplicate_play' });
  }

  // Before-window: game timestamped before starts_at → window check
  if (hasStartsBoundary) {
    const players = makePlayers(stageId, primarySize, true);
    const playedAt = new Date(stage.starts_at!.getTime() - 60 * 60 * 1000).toISOString();
    const startedAt = new Date(new Date(playedAt).getTime() - GAME_DURATION_MS).toISOString();
    gamePlan.push({ slot: slot0, fullSeed: fullSeed0, players, playedAt, startedAt, expected: 'SKIP', reason: 'before_window' });
  }

  // After-window: game timestamped after ends_at → window check
  if (hasEndsBoundary) {
    const players = makePlayers(stageId, primarySize, true);
    const playedAt = new Date(stage.ends_at!.getTime() + 60 * 60 * 1000).toISOString();
    const startedAt = new Date(new Date(playedAt).getTime() - GAME_DURATION_MS).toISOString();
    gamePlan.push({ slot: slot0, fullSeed: fullSeed0, players, playedAt, startedAt, expected: 'SKIP', reason: 'after_window' });
  }

  // Multi-reg violation: intruder shares ghost[0] (pre-registered player) → multi_reg check
  if (canTestMultiReg) {
    const freshRest = makePlayers(stageId, primarySize - 1, true);
    const players = [ghostPlayers[0], ...freshRest];
    const { playedAt, startedAt } = nextTimestamp();
    gamePlan.push({ slot: slot0, fullSeed: fullSeed0, players, playedAt, startedAt, expected: 'SKIP', reason: 'multi_reg_violation' });
  }

  // ── 6. Print plan ───────────────────────────────────────────────────────
  const expectedIngest = gamePlan.filter((g) => g.expected === 'INGEST').length;
  const expectedSkip = gamePlan.filter((g) => g.expected === 'SKIP').length;

  console.log('Game plan:');
  for (const { slot, fullSeed, players, expected, reason } of gamePlan) {
    const tag = expected === 'INGEST' ? '✓' : '✗';
    console.log(
      `  ${tag} [${reason.padEnd(18)}] slot=${slot.slot_id} seed=${fullSeed} players=[${players.join(', ')}]`,
    );
  }
  console.log(`\n  Total: ${gamePlan.length} games → expect ${expectedIngest} INGEST, ${expectedSkip} SKIP\n`);

  if (dryRun) {
    console.log('Dry-run complete.');
    await pool.end();
    return;
  }

  // ── 7. Write simulation games ───────────────────────────────────────────
  console.log('Writing simulation games...');
  for (const entry of gamePlan) {
    await simulateGame({
      fullSeed: entry.fullSeed,
      players: entry.players,
      playedAt: entry.playedAt,
      startedAt: entry.startedAt,
    });
    process.stdout.write('.');
  }
  console.log(` ${gamePlan.length} written.\n`);

  // ── 8. Ingest ───────────────────────────────────────────────────────────
  const uniqueSlots = [
    ...new Map(resolvedSlots.map(({ slot, effectiveSeed }) => [slot.slot_id, { slot, effectiveSeed }])).values(),
  ];

  console.log('Ingesting...\n');
  let totalIngested = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (const { slot, effectiveSeed } of uniqueSlots) {
    const result = await ingestGameSlot({
      slotId: slot.slot_id,
      eventId: stage.event_id,
      allowedTeamSizes: sizes,
      effectiveSeed,
      effectiveVariantId: slot.effective_variant_id,
      eventMeta,
      stageWindow,
    });

    totalIngested += result.ingested;
    totalSkipped += result.skipped;
    allErrors.push(...result.errors);

    const errTag = result.errors.length > 0 ? ` ⚠ ${result.errors.length} error(s)` : '';
    console.log(
      `  slot ${slot.slot_id} (${effectiveSeed}): ingested=${result.ingested} skipped=${result.skipped}${errTag}`,
    );
    for (const e of result.errors) console.log(`    ✗ ${e}`);
  }

  // ── 9. Summary ──────────────────────────────────────────────────────────
  const ingestMatch = totalIngested === expectedIngest;
  const skipMatch = totalSkipped === expectedSkip;
  const passed = ingestMatch && skipMatch && allErrors.length === 0;

  console.log('\n── Summary ──────────────────────────────────────────────────');
  console.log(`  written         : ${gamePlan.length}`);
  console.log(
    `  ingested        : ${totalIngested} (expected ${expectedIngest}) ${ingestMatch ? '✓' : '✗'}`,
  );
  console.log(
    `  skipped         : ${totalSkipped} (expected ${expectedSkip}) ${skipMatch ? '✓' : '✗'}`,
  );
  console.log(`  errors          : ${allErrors.length}`);
  console.log(`  verdict         : ${passed ? '✓ PASS' : '✗ MISMATCH'}`);

  if (allErrors.length > 0) {
    console.log('\nErrors:');
    for (const e of allErrors) console.log(`  ✗ ${e}`);
  }

  if (stage.attempt_policy === 'REQUIRED_ALL' && slotsWithSeed.length > 1) {
    console.log(
      `\n⚑  REQUIRED_ALL (${slotsWithSeed.length} slots): all compliant teams played all slots.`,
    );
    console.log('   Scoring completeness is enforced by results.service.ts, not ingestion.');
  }

  if (bestOfN !== null && slotsWithSeed.length > bestOfN) {
    console.log(
      `\n⚑  BEST_OF_${bestOfN} (${slotsWithSeed.length} slots available): all slots ingested.`,
    );
    console.log(`   Scoring picks best ${bestOfN}. See results.service.ts.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('[simulate-stage] Fatal:', err);
  process.exit(1);
});
