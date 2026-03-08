import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../config/db';

export interface SimTokenPayload {
  id: number;
  label: string;
}

export interface SimAuthenticatedRequest extends Request {
  simToken?: SimTokenPayload;
}

async function resolveSimToken(raw: string): Promise<SimTokenPayload | null> {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const result = await pool.query<{ id: number; label: string }>(
    `SELECT id, label FROM sim_api_tokens WHERE token_hash = $1 AND revoked = FALSE`,
    [hash],
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  // Fire-and-forget last_used_at update
  pool.query(`UPDATE sim_api_tokens SET last_used_at = NOW() WHERE id = $1`, [row.id]).catch(
    () => {},
  );
  return { id: row.id, label: row.label };
}

/** Require a valid X-Sim-Token header. */
export async function simTokenRequired(
  req: SimAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers['x-sim-token'];
  if (!raw || typeof raw !== 'string') {
    res.status(401).json({ error: 'X-Sim-Token header required' });
    return;
  }
  const token = await resolveSimToken(raw);
  if (!token) {
    res.status(401).json({ error: 'Invalid or revoked sim token' });
    return;
  }
  req.simToken = token;
  next();
}

/**
 * Attach sim token identity if X-Sim-Token is present and valid.
 * Does not fail if absent or invalid — use simTokenRequired to enforce.
 */
export async function simTokenOptional(
  req: SimAuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const raw = req.headers['x-sim-token'];
  if (raw && typeof raw === 'string') {
    const token = await resolveSimToken(raw);
    if (token) req.simToken = token;
  }
  next();
}
