import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, del } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'ADMIN' | 'SUPERADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET role = $1 WHERE display_name = $2`, [role, displayName]);
    const elevated = await loginOrCreateUser(displayName, 'password');
    return { token: elevated.token, userId: elevated.user.id };
  }
  const result = await loginOrCreateUser(displayName, 'password');
  return { token, userId: result.user.id };
}

async function createEvent(token: string, slug = 'test-event') {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
}

async function createStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Stage 1',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'TEAM',
      team_scope: 'EVENT',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

const GAMES_BASE = (stageId: number) => `/api/events/test-event/stages/${stageId}/games`;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/games
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/games', () => {
  it('returns empty array for a stage with no games', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns game slots ordered by game_index', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 1 });
    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0 });

    const res = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].game_index).toBe(0);
    expect(res.body[1].game_index).toBe(1);
  });

  it('filters by team_size when query param provided', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 2 });
    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 3 });

    const res = await get(`${GAMES_BASE(stage.id)}?team_size=2`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].team_size).toBe(2);
  });

  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);

    const res = await get('/api/events/test-event/stages/9999/games').set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/games
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/games', () => {
  it('creates a game slot', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, seed_payload: 'abc123', max_score: 25 });

    expect(res.status).toBe(201);
    expect(res.body.game_index).toBe(0);
    expect(res.body.seed_payload).toBe('abc123');
    expect(res.body.max_score).toBe(25);
    expect(res.body.team_size).toBeNull();
  });

  it('creates separate slots for different team_sizes at same game_index', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const r1 = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 2 });
    const r2 = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 3 });

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('returns 409 for duplicate (same game_index and team_size)', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 2 });

    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0, team_size: 2 });

    expect(res.status).toBe(409);
  });

  it('returns 400 for missing game_index', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'x' });

    expect(res.status).toBe(400);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const { token: userToken } = await createUser('other', 'USER');

    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${userToken}`)
      .send({ game_index: 0 });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/games/batch
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/games/batch', () => {
  it('creates multiple slots at once', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(`${GAMES_BASE(stage.id)}/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        slots: [{ game_index: 0 }, { game_index: 1 }, { game_index: 2, seed_payload: 'seed3' }],
      });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(3);
    expect(res.body.duplicates).toBe(0);
  });

  it('reports duplicates without failing entirely', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0 });

    const res = await post(`${GAMES_BASE(stage.id)}/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: [{ game_index: 0 }, { game_index: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.created).toHaveLength(1);
    expect(res.body.duplicates).toBe(1);
  });

  it('returns 400 for empty slots array', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(`${GAMES_BASE(stage.id)}/batch`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slots: [] });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/stages/:stageId/games/:gameId
// ---------------------------------------------------------------------------

describe('PUT /stages/:stageId/games/:gameId', () => {
  it('updates variant_id, seed_payload, and max_score', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const created = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0 });

    const res = await put(`${GAMES_BASE(stage.id)}/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'updated-seed', max_score: 30 });

    expect(res.status).toBe(200);
    expect(res.body.seed_payload).toBe('updated-seed');
    expect(res.body.max_score).toBe(30);
  });

  it('returns 404 for unknown game slot', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await put(`${GAMES_BASE(stage.id)}/9999`)
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'x' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stages/:stageId/games/:gameId
// ---------------------------------------------------------------------------

describe('DELETE /stages/:stageId/games/:gameId', () => {
  it('deletes a game slot with no results', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const created = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0 });

    const res = await del(`${GAMES_BASE(stage.id)}/${created.body.id}`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown game slot', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await del(`${GAMES_BASE(stage.id)}/9999`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/games/propagate
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/games/propagate', () => {
  it('applies seed formula to game slots', async () => {
    const { token } = await createUser('owner', 'ADMIN');

    // Create event with a seed formula
    await post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'test-event',
        name: 'Test Event',
        long_description: 'Test.',
        allowed_team_sizes: [2],
        seed_rule_json: { formula: '{eID}-{sID}-{gID}' },
      });

    const stageRes = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Stage 1',
        mechanism: 'SEEDED_LEADERBOARD',
        participation_type: 'TEAM',
        team_scope: 'EVENT',
        attempt_policy: 'SINGLE',
        time_policy: 'WINDOW',
      });
    const stage = stageRes.body as { id: number };

    // Create slots with no seed_payload
    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 0 });
    await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 1 });

    const res = await post(`${GAMES_BASE(stage.id)}/propagate`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // Slots should now have seed_payload set
    const listRes = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(listRes.body[0].seed_payload).not.toBeNull();
    expect(listRes.body[1].seed_payload).not.toBeNull();
  });
});
