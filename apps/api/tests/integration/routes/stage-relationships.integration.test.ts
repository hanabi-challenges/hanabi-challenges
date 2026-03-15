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
  const res = await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test event.',
      allowed_team_sizes: [2],
    });
  return res.body as { id: number; slug: string };
}

async function createStage(token: string, slug = 'test-event', label = 'Stage') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label,
      mechanism: 'SEEDED_LEADERBOARD',
      team_policy: 'SELF_FORMED',
      team_scope: 'EVENT',
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
// GET /api/events/:slug/stage-relationships
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/stage-relationships', () => {
  it('returns empty array when no relationships exist', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);

    const res = await get('/api/events/test-event/stage-relationships').set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns existing relationships', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Stage 1');
    const s2 = await createStage(token, 'test-event', 'Stage 2');

    await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const res = await get('/api/events/test-event/stage-relationships').set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].source_stage_id).toBe(s1.id);
    expect(res.body[0].target_stage_id).toBe(s2.id);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('other', 'USER');

    const res = await get('/api/events/test-event/stage-relationships').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stage-relationships
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/stage-relationships', () => {
  it('creates a relationship with filter_type ALL', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_stage_id: s1.id,
        target_stage_id: s2.id,
        filter_type: 'ALL',
        seeding_method: 'RANKED',
      });

    expect(res.status).toBe(201);
    expect(res.body.filter_type).toBe('ALL');
    expect(res.body.seeding_method).toBe('RANKED');
    expect(res.body.filter_value).toBeNull();
  });

  it('creates a relationship with filter_type TOP_N', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({
        source_stage_id: s1.id,
        target_stage_id: s2.id,
        filter_type: 'TOP_N',
        filter_value: 8,
      });

    expect(res.status).toBe(201);
    expect(res.body.filter_type).toBe('TOP_N');
    expect(Number(res.body.filter_value)).toBe(8);
  });

  it('returns 400 when filter_value missing for TOP_N', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'TOP_N' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when filter_value missing for THRESHOLD', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'THRESHOLD' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for cross-event stages', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token, 'event-a');
    await createEvent(token, 'event-b');
    const s1 = await createStage(token, 'event-a', 'Stage A');
    const s2 = await createStage(token, 'event-b', 'Stage B');

    const res = await post('/api/events/event-a/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    expect(res.status).toBe(400);
  });

  it('returns 409 for duplicate relationship', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    expect(res.status).toBe(409);
  });

  it('returns 400 for invalid filter_type', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'INVALID' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when source and target are the same stage', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');

    const res = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s1.id, filter_type: 'ALL' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/stage-relationships/:id
// ---------------------------------------------------------------------------

describe('PUT /api/events/:slug/stage-relationships/:id', () => {
  it('updates filter_type and seeding_method', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const created = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const res = await put(`/api/events/test-event/stage-relationships/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filter_type: 'TOP_N', filter_value: 4, seeding_method: 'RANDOM' });

    expect(res.status).toBe(200);
    expect(res.body.filter_type).toBe('TOP_N');
    expect(Number(res.body.filter_value)).toBe(4);
    expect(res.body.seeding_method).toBe('RANDOM');
  });

  it('returns 400 when changing to TOP_N without filter_value', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const created = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const res = await put(`/api/events/test-event/stage-relationships/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ filter_type: 'TOP_N' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown id', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);

    const res = await put('/api/events/test-event/stage-relationships/9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ seeding_method: 'RANDOM' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stage-relationships/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/stage-relationships/:id', () => {
  it('deletes a relationship', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);
    const s1 = await createStage(token, 'test-event', 'Qual');
    const s2 = await createStage(token, 'test-event', 'Finals');

    const created = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${token}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const res = await del(`/api/events/test-event/stage-relationships/${created.body.id}`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(204);

    const listRes = await get('/api/events/test-event/stage-relationships').set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(listRes.body).toHaveLength(0);
  });

  it('returns 404 for unknown id', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createEvent(token);

    const res = await del('/api/events/test-event/stage-relationships/9999').set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createEvent(ownerToken);
    const s1 = await createStage(ownerToken, 'test-event', 'Qual');
    const s2 = await createStage(ownerToken, 'test-event', 'Finals');

    const created = await post('/api/events/test-event/stage-relationships')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ source_stage_id: s1.id, target_stage_id: s2.id, filter_type: 'ALL' });

    const { token: userToken } = await createUser('other', 'USER');
    const res = await del(`/api/events/test-event/stage-relationships/${created.body.id}`).set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(403);
  });
});
