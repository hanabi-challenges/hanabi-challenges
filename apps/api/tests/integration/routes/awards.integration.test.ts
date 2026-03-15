import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, patch, del } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'ADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET role = $1 WHERE display_name = $2`, [role, displayName]);
    const elevated = await loginOrCreateUser(displayName, 'password');
    return { token: elevated.token };
  }
  return { token };
}

async function createAndPublishEvent(token: string, slug = 'test-event') {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2] });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Stage 1',
      mechanism: 'SEEDED_LEADERBOARD',
      team_policy: 'SELF_FORMED',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/awards
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/awards', () => {
  it('returns 404 for unknown event', async () => {
    const res = await get('/api/events/no-such/awards');
    expect(res.status).toBe(404);
  });

  it('returns empty grouped response for event with no awards', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await get('/api/events/test-event/awards');
    expect(res.status).toBe(200);
    expect(res.body.event_awards).toEqual([]);
    expect(res.body.stage_awards).toEqual([]);
  });

  it('returns awards grouped by event vs stage', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const stage = await createStage(token);

    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Event Award', criteria_type: 'MANUAL' });
    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Stage Award',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });

    const res = await get('/api/events/test-event/awards');
    expect(res.status).toBe(200);
    expect(res.body.event_awards).toHaveLength(1);
    expect(res.body.event_awards[0].name).toBe('Event Award');
    expect(res.body.stage_awards).toHaveLength(1);
    expect(res.body.stage_awards[0].stage_id).toBe(stage.id);
    expect(res.body.stage_awards[0].awards).toHaveLength(1);
    expect(res.body.stage_awards[0].awards[0].name).toBe('Stage Award');
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/awards', () => {
  it('rejects unauthenticated', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards').send({
      name: 'X',
      criteria_type: 'MANUAL',
    });
    expect(res.status).toBe(401);
  });

  it('rejects non-admin', async () => {
    const { token: admin } = await createUser('owner', 'ADMIN');
    const { token: user } = await createUser('user');
    await createAndPublishEvent(admin);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${user}`)
      .send({ name: 'X', criteria_type: 'MANUAL' });
    expect(res.status).toBe(403);
  });

  it('rejects missing name', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ criteria_type: 'MANUAL' });
    expect(res.status).toBe(400);
  });

  it('rejects invalid criteria_type', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'BOGUS' });
    expect(res.status).toBe(400);
  });

  it('rejects RANK_POSITION without positions', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'RANK_POSITION' });
    expect(res.status).toBe(400);
  });

  it('rejects stage_id from another event', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'MANUAL', stage_id: 9999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stage_id/);
  });

  it('creates a MANUAL award successfully', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Participation', criteria_type: 'MANUAL', description: 'Just for showing up' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Participation');
    expect(res.body.criteria_type).toBe('MANUAL');
  });

  it('creates a RANK_POSITION award with criteria_value', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const stage = await createStage(token);
    const res = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Gold',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });
    expect(res.status).toBe(201);
    expect(res.body.stage_id).toBe(stage.id);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/awards/:awardId
// ---------------------------------------------------------------------------

describe('PUT /api/events/:slug/awards/:awardId', () => {
  it('returns 404 for unknown award', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await put('/api/events/test-event/awards/9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('updates award name and description', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const create = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Old Name', criteria_type: 'MANUAL' });
    const awardId = create.body.id;

    const res = await put(`/api/events/test-event/awards/${awardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name', description: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.description).toBe('Updated');
  });

  it('rejects invalid criteria_type on update', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const create = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'MANUAL' });
    const awardId = create.body.id;

    const res = await put(`/api/events/test-event/awards/${awardId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ criteria_type: 'BAD' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/awards/reorder
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:slug/awards/reorder', () => {
  it('reorders awards', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const a1 = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A', criteria_type: 'MANUAL' });
    const a2 = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'B', criteria_type: 'MANUAL' });

    const res = await patch('/api/events/test-event/awards/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({
        entries: [
          { award_id: a1.body.id, sort_order: 10 },
          { award_id: a2.body.id, sort_order: 5 },
        ],
      });
    expect(res.status).toBe(204);

    const list = await get('/api/events/test-event/awards');
    const orders = list.body.event_awards.map((a: { sort_order: number }) => a.sort_order);
    expect(orders).toContain(5);
    expect(orders).toContain(10);
  });

  it('rejects award_ids from a different event', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await patch('/api/events/test-event/awards/reorder')
      .set('Authorization', `Bearer ${token}`)
      .send({ entries: [{ award_id: 9999, sort_order: 0 }] });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/awards/:awardId
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/awards/:awardId', () => {
  it('returns 404 for unknown award', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await del('/api/events/test-event/awards/9999').set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(404);
  });

  it('deletes an award with no grants', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const create = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'MANUAL' });
    const awardId = create.body.id;

    const res = await del(`/api/events/test-event/awards/${awardId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(204);

    const list = await get('/api/events/test-event/awards');
    expect(list.body.event_awards).toHaveLength(0);
  });

  it('blocks deletion if award has grants', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const create = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'MANUAL' });
    const awardId = create.body.id;

    // Manually insert a grant referencing this award
    const userRes = await pool.query<{ id: number }>(
      `SELECT id FROM users WHERE display_name = 'owner'`,
    );
    await pool.query(`INSERT INTO event_award_grants (award_id, user_id) VALUES ($1, $2)`, [
      awardId,
      userRes.rows[0].id,
    ]);

    const res = await del(`/api/events/test-event/awards/${awardId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(409);
  });
});
