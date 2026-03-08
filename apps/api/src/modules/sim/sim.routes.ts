// src/modules/sim/sim.routes.ts
import crypto from 'crypto';
import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../../config/db';
import {
  authRequired,
  requireSuperadmin,
  AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import { simTokenRequired, SimAuthenticatedRequest } from '../../middleware/simTokenMiddleware';
import { createGameResult, ZeroReason } from '../results/result.service';
import { submitRoundScore } from '../session-ladder/session-ladder.service';
import { randomHexColor, pickTextColor } from '../auth/auth.service';
import { env } from '../../config/env';

const router = Router();

/* ------------------------------------------------------------------
 * Token management — superadmin JWT required
 * ----------------------------------------------------------------*/

// POST /api/sim/tokens
// Body: { label: string }
// Returns: { id, label, token } — token shown once only
router.post(
  '/tokens',
  authRequired,
  requireSuperadmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
    if (!label) {
      return res.status(400).json({ error: 'label is required' });
    }

    const raw = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    const result = await pool.query<{ id: number }>(
      `INSERT INTO sim_api_tokens (label, token_hash, created_by_user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [label, hash, req.user!.userId],
    );

    res.status(201).json({ id: result.rows[0].id, label, token: raw });
  },
);

// GET /api/sim/tokens
// Returns all tokens (hash omitted)
router.get(
  '/tokens',
  authRequired,
  requireSuperadmin,
  async (_req: AuthenticatedRequest, res: Response) => {
    const result = await pool.query(
      `SELECT id, label, created_by_user_id, created_at, last_used_at, revoked
       FROM sim_api_tokens
       ORDER BY created_at DESC`,
    );
    res.json(result.rows);
  },
);

// DELETE /api/sim/tokens/:id  (revoke)
router.delete(
  '/tokens/:id',
  authRequired,
  requireSuperadmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid token id' });
    }
    const result = await pool.query(
      `UPDATE sim_api_tokens SET revoked = TRUE WHERE id = $1 RETURNING id`,
      [id],
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Token not found' });
    }
    res.json({ ok: true, id });
  },
);

/* ------------------------------------------------------------------
 * Sim run management — sim token required
 * ----------------------------------------------------------------*/

// POST /api/sim/runs
// Body: { label?: string }
// Returns: { id, label, created_at }
router.post('/runs', simTokenRequired, async (req: SimAuthenticatedRequest, res: Response) => {
  const label = typeof req.body?.label === 'string' ? req.body.label.trim() : null;

  const result = await pool.query<{ id: number; label: string | null; created_at: string }>(
    `INSERT INTO sim_runs (label, created_by_token_id)
     VALUES ($1, $2)
     RETURNING id, label, created_at`,
    [label, req.simToken!.id],
  );

  res.status(201).json(result.rows[0]);
});

// DELETE /api/sim/runs/:id  (GC)
// Deletes all data produced by this sim run in dependency order.
router.delete('/runs/:id', simTokenRequired, async (req: SimAuthenticatedRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid run id' });
  }

  const check = await pool.query(`SELECT id FROM sim_runs WHERE id = $1`, [id]);
  if (check.rowCount === 0) {
    return res.status(404).json({ error: 'Sim run not found' });
  }

  // Delete events first — cascades all event data (teams, games, results, etc.)
  const eventsResult = await pool.query(
    `DELETE FROM events WHERE sim_run_id = $1 RETURNING id`,
    [id],
  );

  // Delete users — cascades memberships, eligibilities, notifications, etc.
  const usersResult = await pool.query(
    `DELETE FROM users WHERE sim_run_id = $1 RETURNING id`,
    [id],
  );

  await pool.query(`UPDATE sim_runs SET gc_at = NOW() WHERE id = $1`, [id]);
  await pool.query(`DELETE FROM sim_runs WHERE id = $1`, [id]);

  res.json({
    ok: true,
    deleted: {
      events: eventsResult.rowCount ?? 0,
      users: usersResult.rowCount ?? 0,
    },
  });
});

/* ------------------------------------------------------------------
 * Sim user creation — sim token required
 * ----------------------------------------------------------------*/

// POST /api/sim/users
// Body: { display_name: string, password: string, sim_run_id: number }
// Returns: { user, token } — same shape as /api/login
router.post('/users', simTokenRequired, async (req: SimAuthenticatedRequest, res: Response) => {
  const { display_name, password, sim_run_id } = req.body ?? {};

  if (!display_name || !password || sim_run_id == null) {
    return res.status(400).json({ error: 'display_name, password, and sim_run_id are required' });
  }

  const runId = Number(sim_run_id);
  if (!Number.isInteger(runId) || runId <= 0) {
    return res.status(400).json({ error: 'Invalid sim_run_id' });
  }

  const runCheck = await pool.query(`SELECT id FROM sim_runs WHERE id = $1`, [runId]);
  if (runCheck.rowCount === 0) {
    return res.status(404).json({ error: 'Sim run not found' });
  }

  const passwordHash = await bcrypt.hash(String(password), 12);
  const color_hex = randomHexColor();
  const text_color = pickTextColor(color_hex);

  let userRow: {
    id: number;
    display_name: string;
    role: string;
    color_hex: string;
    text_color: string;
  };

  try {
    const result = await pool.query(
      `INSERT INTO users (display_name, password_hash, color_hex, text_color, sim_run_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, display_name, role, color_hex, text_color`,
      [String(display_name), passwordHash, color_hex, text_color, runId],
    );
    userRow = result.rows[0];
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'display_name already taken' });
    }
    throw err;
  }

  const token = jwt.sign(
    {
      userId: userRow.id,
      displayName: userRow.display_name,
      role: userRow.role,
      color_hex: userRow.color_hex,
      text_color: userRow.text_color,
    },
    env.JWT_SECRET,
    { expiresIn: '7d' },
  );

  res.status(201).json({ user: userRow, token });
});

/* ------------------------------------------------------------------
 * Sim score submission — sim token required, bypasses pending_validations
 * ----------------------------------------------------------------*/

// POST /api/sim/results
// Same body as POST /api/results but no validate-replay required.
router.post('/results', simTokenRequired, async (req: SimAuthenticatedRequest, res: Response) => {
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
  } = req.body ?? {};

  if (event_team_id == null || event_game_template_id == null || score == null) {
    return res.status(400).json({
      error: 'event_team_id, event_game_template_id, and score are required',
    });
  }

  if (
    zero_reason != null &&
    zero_reason !== 'Strike Out' &&
    zero_reason !== 'Time Out' &&
    zero_reason !== 'VTK'
  ) {
    return res.status(400).json({
      error: "zero_reason must be one of 'Strike Out', 'Time Out', 'VTK', or null",
    });
  }

  try {
    const row = await createGameResult({
      event_team_id,
      event_game_template_id,
      game_id: game_id ?? null,
      score,
      zero_reason: (zero_reason as ZeroReason) ?? null,
      bottom_deck_risk: bottom_deck_risk == null ? null : Number(bottom_deck_risk),
      notes: notes ?? null,
      played_at: played_at ?? null,
      players: Array.isArray(players) ? (players as string[]) : undefined,
    });
    res.status(201).json(row);
  } catch (err) {
    if ((err as { code?: string }).code === 'GAME_RESULT_EXISTS') {
      return res.status(409).json({ error: 'A result already exists for this team and template' });
    }
    console.error('[sim:results] error', err);
    res.status(500).json({ error: 'Failed to create game result' });
  }
});

// POST /api/sim/session-ladder/rounds/:roundId/submit-score
// Body: { team_no, score, submitted_by_user_id, replay_game_id?, end_condition?, bottom_deck_risk? }
// Bypasses canSubmitTeamScore — sim token is the authority.
router.post(
  '/session-ladder/rounds/:roundId/submit-score',
  simTokenRequired,
  async (req: SimAuthenticatedRequest, res: Response) => {
    const roundId = Number(req.params.roundId);
    const teamNo = Number(req.body?.team_no);
    const score = Number(req.body?.score);
    const submittedByUserId = Number(req.body?.submitted_by_user_id);
    const replayGameId =
      req.body?.replay_game_id == null ? null : Number(req.body.replay_game_id);
    const endCondition =
      req.body?.end_condition == null ? null : Number(req.body.end_condition);
    const bottomDeckRisk =
      req.body?.bottom_deck_risk == null ? null : Number(req.body.bottom_deck_risk);

    if (!Number.isInteger(roundId) || roundId <= 0) {
      return res.status(400).json({ error: 'Invalid roundId' });
    }
    if (!Number.isInteger(teamNo) || teamNo <= 0) {
      return res.status(400).json({ error: 'team_no must be a positive integer' });
    }
    if (!Number.isFinite(score)) {
      return res.status(400).json({ error: 'score must be a number' });
    }
    if (!Number.isInteger(submittedByUserId) || submittedByUserId <= 0) {
      return res.status(400).json({ error: 'submitted_by_user_id must be a positive integer' });
    }

    try {
      const row = await submitRoundScore({
        roundId,
        teamNo,
        score,
        submittedByUserId,
        replayGameId,
        endCondition,
        bottomDeckRisk,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error('[sim:session-ladder:submit-score] error', err);
      res.status(500).json({ error: 'Failed to submit score' });
    }
  },
);

export default router;
