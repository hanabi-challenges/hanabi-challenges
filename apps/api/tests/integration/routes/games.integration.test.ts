import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, del, patch } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'HOST' | 'SUPERADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET roles = ARRAY['USER', $1::TEXT] WHERE display_name = $2`, [
      role,
      displayName,
    ]);
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
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns game slots ordered by game_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    // Create two slots in sequence — auto-assigned game_index 0 and 1
    await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});
    await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});

    const res = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].game_index).toBe(0);
    expect(res.body[1].game_index).toBe(1);
  });

  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'HOST');
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
  it('creates a game slot with auto-assigned game_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'abc123' });

    expect(res.status).toBe(201);
    expect(res.body.game_index).toBe(0);
    expect(res.body.seed_payload).toBe('abc123');
    expect(res.body.effective_max_score).toBe(25); // No Variant default
  });

  it('creates multiple slots with sequential game_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const r1 = await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});
    const r2 = await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});

    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r1.body.game_index).toBe(0);
    expect(r2.body.game_index).toBe(1);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: userToken } = await createUser('user');
    const res = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/games/bulk
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/games/bulk', () => {
  it('creates multiple slots at once', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(`${GAMES_BASE(stage.id)}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 3 });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(3);
    expect(res.body[0].game_index).toBe(0);
    expect(res.body[1].game_index).toBe(1);
    expect(res.body[2].game_index).toBe(2);
  });

  it('creates multiple slots with seeds', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(`${GAMES_BASE(stage.id)}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 2, seeds: ['seed-a', 'seed-b'] });

    expect(res.status).toBe(201);
    expect(res.body[0].seed_payload).toBe('seed-a');
    expect(res.body[1].seed_payload).toBe('seed-b');
  });

  it('returns 400 for invalid count', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await post(`${GAMES_BASE(stage.id)}/bulk`)
      .set('Authorization', `Bearer ${token}`)
      .send({ count: 0 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/stages/:stageId/games/:gameId
// ---------------------------------------------------------------------------

describe('PUT /stages/:stageId/games/:gameId', () => {
  it('updates seed_payload and nickname', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const created = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const res = await put(`${GAMES_BASE(stage.id)}/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'updated-seed', nickname: 'Game 1' });

    expect(res.status).toBe(200);
    expect(res.body.seed_payload).toBe('updated-seed');
    expect(res.body.nickname).toBe('Game 1');
  });

  it('returns 404 for unknown game slot', async () => {
    const { token } = await createUser('owner', 'HOST');
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
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const created = await post(GAMES_BASE(stage.id))
      .set('Authorization', `Bearer ${token}`)
      .send({});

    const res = await del(`${GAMES_BASE(stage.id)}/${created.body.id}`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(204);
  });

  it('returns 404 for unknown game slot', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const res = await del(`${GAMES_BASE(stage.id)}/9999`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/stages/:stageId/games/:gameId/reorder
// ---------------------------------------------------------------------------

describe('PATCH /stages/:stageId/games/:gameId/reorder', () => {
  it('reorders a game slot', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const stage = await createStage(token);

    const g1 = await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});
    await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});

    // Move game 0 to position 1
    const res = await patch(`${GAMES_BASE(stage.id)}/${g1.body.id}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ game_index: 1 });

    expect(res.status).toBe(200);
    expect(res.body.game_index).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// effective_seed from stage/event formula
// ---------------------------------------------------------------------------

describe('effective_seed from stage/event formula', () => {
  it('resolves seed from event-level formula', async () => {
    const { token } = await createUser('owner', 'HOST');

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

    // Create a slot with no explicit seed_payload
    await post(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`).send({});

    const listRes = await get(GAMES_BASE(stage.id)).set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    // effective_seed is resolved from the formula
    expect(listRes.body[0].effective_seed).not.toBeNull();
    expect(listRes.body[0].effective_seed).toMatch(/^\d+-\d+-\d+$/);
  });
});
