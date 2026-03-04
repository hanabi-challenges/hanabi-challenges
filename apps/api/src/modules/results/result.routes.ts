// src/modules/results/result.routes.ts
import { Router, Request, Response } from 'express';
import { authRequired } from '../../middleware/authMiddleware';
import { createGameResult, getGameResultById, ZeroReason } from './result.service';

const router = Router();

/**
 * POST /api/results
 * Create a new game result (i.e., insert a row into event_games).
 *
 * Body:
 * {
 *   "event_team_id": number,
 *   "event_game_template_id": number,
 *   "game_id": number | null,          // hanab.live id
 *   "score": number,
 *   "zero_reason": "Strike Out" | "Time Out" | "VTK" | null,
 *   "bottom_deck_risk": number | null,
 *   "notes": string | null,
 *   "played_at": string | null,        // ISO timestamp, optional
 *   "players": string[]                // optional display_names in seat order
 * }
 */
router.post('/', authRequired, async (req: Request, res: Response) => {
  const {
    event_team_id,
    event_game_template_id,
    game_id,
    score,
    zero_reason,
    bottom_deck_risk,
    notes,
    played_at,
    players,
  } = req.body;

  console.log('[results:create] incoming', {
    event_team_id,
    event_game_template_id,
    game_id,
    score,
    zero_reason,
    bottom_deck_risk,
    played_at,
    playersCount: Array.isArray(players) ? players.length : 0,
  });

  if (event_team_id == null || event_game_template_id == null || score == null) {
    res.status(400).json({
      error: 'event_team_id, event_game_template_id, and score are required',
    });
    return;
  }

  if (
    zero_reason != null &&
    zero_reason !== 'Strike Out' &&
    zero_reason !== 'Time Out' &&
    zero_reason !== 'VTK'
  ) {
    res.status(400).json({
      error: "zero_reason must be one of 'Strike Out', 'Time Out', 'VTK', or null",
    });
    return;
  }

  try {
    const row = await createGameResult({
      event_team_id,
      event_game_template_id,
      game_id: game_id ?? null,
      score,
      zero_reason: zero_reason as ZeroReason,
      bottom_deck_risk: bottom_deck_risk === undefined ? null : Number(bottom_deck_risk),
      notes: notes ?? null,
      played_at: played_at ?? null,
      players: Array.isArray(players) ? (players as string[]) : undefined,
    });

    console.log('[results:create] success', { id: row.id, event_team_id, event_game_template_id });

    res.status(201).json(row);
  } catch (err) {
    console.error('[results:create] error', err);
    if (err.code === 'GAME_RESULT_EXISTS') {
      res.status(409).json({
        error: 'A game result already exists for this team and template',
      });
      return;
    }

    console.error('Error creating game result:', err);
    res.status(500).json({ error: 'Failed to create game result' });
  }
});

/**
 * GET /api/results/:id
 * Fetch a fully-hydrated result by event_games.id
 */
router.get('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid result id' });
    return;
  }

  try {
    const detail = await getGameResultById(id);

    if (!detail) {
      res.status(404).json({ error: 'Result not found' });
      return;
    }

    res.json(detail);
  } catch (err) {
    console.error('Error fetching game result:', err);
    res.status(500).json({ error: 'Failed to fetch game result' });
  }
});

export default router;
