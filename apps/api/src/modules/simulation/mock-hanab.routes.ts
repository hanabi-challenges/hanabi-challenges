// Mock hanab-live API routes.
//
// Mounted on the main Express app ONLY when SIMULATION_MODE=true, at the root
// so the paths exactly match hanab.live's URL structure.  The hanab-live client
// is pointed at this server via HANAB_LIVE_BASE_URL=http://localhost:PORT.
//
// Routes:
//   GET /api/v1/seed/:fullSeed   — seed list (paginated), keyed by full seed string
//   GET /export/:gameId          — full game export (deck + actions, no score)

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getSimulatedGamesBySeed, getSimulatedGameById } from './simulation.service';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/seed/:fullSeed
//
// Returns the hanab.live seed-list envelope:
//   { total_rows: N, rows: [{ id, score, numPlayers, datetimeStarted, datetimeFinished, tags }] }
//
// Supports ?size=N&page=N pagination (matches what fetchGamesBySeed sends).
// ---------------------------------------------------------------------------

router.get('/api/v1/seed/:fullSeed', async (req: Request, res: Response) => {
  const fullSeed = String(req.params.fullSeed);
  const sizeParam = Array.isArray(req.query.size) ? req.query.size[0] : (req.query.size ?? '100');
  const pageParam = Array.isArray(req.query.page) ? req.query.page[0] : (req.query.page ?? '0');
  const size = Math.min(Math.max(parseInt(String(sizeParam), 10) || 100, 1), 100);
  const page = Math.max(parseInt(String(pageParam), 10) || 0, 0);

  const { totalRows, rows } = await getSimulatedGamesBySeed(fullSeed, page, size);

  res.json({
    total_rows: totalRows,
    rows: rows.map((r) => ({
      id: Number(r.id),
      score: r.score,
      numPlayers: r.players.length,
      datetimeStarted: r.datetime_started?.toISOString() ?? null,
      datetimeFinished: r.datetime_finished?.toISOString() ?? null,
      tags: '', // no tags on simulated games
    })),
  });
});

// ---------------------------------------------------------------------------
// GET /export/:gameId
//
// Returns the hanab.live export envelope — score is intentionally omitted to
// match real hanab.live behaviour (the ingestion pipeline reads score from the
// seed-list response, not the export).
// ---------------------------------------------------------------------------

router.get('/export/:gameId', async (req: Request, res: Response) => {
  const gameId = parseInt(String(req.params.gameId), 10);
  if (!Number.isFinite(gameId)) return res.status(400).json({ error: 'Invalid gameId' });

  const game = await getSimulatedGameById(gameId);
  if (!game) return res.status(404).json({ error: 'Not found' });

  res.json({
    id: Number(game.id),
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

export default router;
