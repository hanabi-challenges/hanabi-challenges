// src/modules/challenges/challenge.routes.ts
import { Router, Request, Response } from 'express';
import { authRequired, requireAdmin } from '../../middleware/authMiddleware';
import {
  listChallenges,
  createChallenge,
  listChallengeSeeds,
  createChallengeSeed,
  listChallengeTeams,
  getChallengeBySlug,
} from './challenge.service';
import { pool } from '../../config/db';
import { validateSlug } from '../../utils/slug';

const router = Router();

const MAX_NAME_LENGTH = 100;
const MAX_SHORT_DESC_LENGTH = 500;
const MAX_DESC_LENGTH = 10000;

function validateLength(
  field: string,
  value: string | null | undefined,
  opts: { min?: number; max?: number },
) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    return `${field} must be a string`;
  }
  const trimmed = value.trim();
  if (opts.min && trimmed.length < opts.min) {
    return `${field} must be at least ${opts.min} characters`;
  }
  if (opts.max && trimmed.length > opts.max) {
    return `${field} must be at most ${opts.max} characters`;
  }
  return null;
}

/* ------------------------------------------
 *  Helper: look up numeric challenge_id from slug
 * ----------------------------------------*/
async function getChallengeId(slug: string): Promise<number | null> {
  const result = await pool.query<{ id: number }>(`SELECT id FROM challenges WHERE slug = $1`, [
    slug,
  ]);
  return result.rowCount > 0 ? result.rows[0].id : null;
}

/* ------------------------------------------
 *  GET /api/challenges
 * ----------------------------------------*/
router.get('/', async (_req: Request, res: Response) => {
  try {
    const challenges = await listChallenges();
    res.json(challenges);
  } catch (err) {
    console.error('Error fetching challenges:', err);
    res.status(500).json({ error: 'Failed to fetch challenges' });
  }
});

/* ------------------------------------------
 *  POST /api/challenges  (ADMIN)
 * ----------------------------------------*/
router.post('/', authRequired, requireAdmin, async (req: Request, res: Response) => {
  const { name, slug, short_description, long_description, starts_at, ends_at } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!slug) return res.status(400).json({ error: 'slug is required' });
  if (!long_description) return res.status(400).json({ error: 'long_description is required' });

  const slugError = validateSlug(slug);
  if (slugError) return res.status(400).json({ error: slugError });

  const nameError = validateLength('name', name, { min: 3, max: MAX_NAME_LENGTH });
  if (nameError) return res.status(400).json({ error: nameError });

  const shortDescError = validateLength('short_description', short_description, {
    max: MAX_SHORT_DESC_LENGTH,
  });
  if (shortDescError) return res.status(400).json({ error: shortDescError });

  const longDescError = validateLength('long_description', long_description, {
    min: 10,
    max: MAX_DESC_LENGTH,
  });
  if (longDescError) return res.status(400).json({ error: longDescError });
  if (starts_at && ends_at) {
    const startDate = new Date(starts_at);
    const endDate = new Date(ends_at);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for starts_at or ends_at' });
    }
    if (endDate <= startDate) {
      return res.status(400).json({ error: 'ends_at must be after starts_at' });
    }
  }

  try {
    const challenge = await createChallenge({
      name,
      slug,
      short_description: short_description ?? null,
      long_description,
      starts_at: starts_at ?? null,
      ends_at: ends_at ?? null,
    });

    res.status(201).json(challenge);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'CHALLENGE_NAME_EXISTS') {
      return res.status(409).json({ error: 'Challenge name must be unique' });
    }

    console.error('Error creating challenge:', err);
    res.status(500).json({ error: 'Failed to create challenge' });
  }
});

/* ------------------------------------------
 *  GET /api/challenges/:slug
 * ----------------------------------------*/
router.get('/:slug', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const challenge = await getChallengeBySlug(slug);

    if (!challenge) {
      return res.status(404).json({ error: 'Challenge not found' });
    }

    res.json(challenge);
  } catch (err) {
    console.error('Error fetching challenge by slug:', err);
    res.status(500).json({ error: 'Failed to fetch challenge' });
  }
});

/* ------------------------------------------
 *  GET /api/challenges/:slug/seeds
 * ----------------------------------------*/
router.get('/:slug/seeds', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const challengeId = await getChallengeId(slug);
    if (!challengeId) return res.status(404).json({ error: 'Challenge not found' });

    const seeds = await listChallengeSeeds(challengeId);
    res.json(seeds);
  } catch (err) {
    console.error('Error fetching seeds:', err);
    res.status(500).json({ error: 'Failed to fetch seeds' });
  }
});

/* ------------------------------------------
 *  POST /api/challenges/:slug/seeds  (ADMIN)
 * ----------------------------------------*/
router.post('/:slug/seeds', authRequired, requireAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const { seed_number, variant, seed_payload } = req.body;

  if (seed_number == null) {
    return res.status(400).json({ error: 'seed_number is required' });
  }

  try {
    const challengeId = await getChallengeId(slug);
    if (!challengeId) return res.status(404).json({ error: 'Challenge not found' });

    const seed = await createChallengeSeed(challengeId, {
      seed_number,
      variant: variant ?? null,
      seed_payload: seed_payload ?? null,
    });

    res.status(201).json(seed);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'CHALLENGE_SEED_EXISTS') {
      return res.status(409).json({
        error: 'Seed already exists for this challenge with that number',
      });
    }

    console.error('Error creating seed:', err);
    res.status(500).json({ error: 'Failed to create seed' });
  }
});

/* ------------------------------------------
 *  GET /api/challenges/:slug/teams
 * ----------------------------------------*/
router.get('/:slug/teams', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const challengeId = await getChallengeId(slug);
    if (!challengeId) return res.status(404).json({ error: 'Challenge not found' });

    const teams = await listChallengeTeams(challengeId);
    res.json(teams);
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

export default router;
