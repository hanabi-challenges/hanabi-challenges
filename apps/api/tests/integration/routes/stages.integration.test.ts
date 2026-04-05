import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, patch, del } from '../../support/api';

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

const VALID_STAGE = {
  label: 'Stage 1',
  mechanism: 'SEEDED_LEADERBOARD',
  participation_type: 'TEAM',
  team_scope: 'EVENT',
  attempt_policy: 'SINGLE',
  time_policy: 'WINDOW',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/stages', () => {
  it('returns empty array for event with no stages', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await get('/api/events/test-event/stages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns stages ordered by stage_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'First' });
    await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'Second' });

    const res = await get('/api/events/test-event/stages').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].label).toBe('First');
    expect(res.body[0].stage_index).toBe(0);
    expect(res.body[1].label).toBe('Second');
    expect(res.body[1].stage_index).toBe(1);
  });

  it('returns 404 for unknown event', async () => {
    const res = await get('/api/events/no-such-event/stages');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/stages/:stageId', () => {
  it('returns a single stage', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);
    const stageId = created.body.id;

    const res = await get(`/api/events/test-event/stages/${stageId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(stageId);
    expect(res.body.label).toBe('Stage 1');
  });

  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await get('/api/events/test-event/stages/9999');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/stages', () => {
  it('creates a stage with auto-assigned stage_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);

    expect(res.status).toBe(201);
    expect(res.body.label).toBe('Stage 1');
    expect(res.body.stage_index).toBe(0);
    expect(res.body.mechanism).toBe('SEEDED_LEADERBOARD');
    expect(res.body.status).toBe('ANNOUNCED');
  });

  it('assigns sequential stage_index for multiple stages', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'A' });
    const second = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'B' });

    expect(second.body.stage_index).toBe(1);
  });

  it('returns 400 for missing required fields', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Missing fields' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid mechanism', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, mechanism: 'INVALID' });

    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await post('/api/events/test-event/stages').send(VALID_STAGE);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin user', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('other', 'USER');

    const res = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${userToken}`)
      .send(VALID_STAGE);

    expect(res.status).toBe(403);
  });

  it('co-admin can also create stages', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: coAdminId, token: coAdminToken } = await createUser('coadmin', 'USER');

    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: coAdminId });

    const res = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${coAdminToken}`)
      .send(VALID_STAGE);

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/stages/:stageId
// ---------------------------------------------------------------------------

describe('PUT /api/events/:slug/stages/:stageId', () => {
  it('updates stage label and dates', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);
    const stageId = created.body.id;

    const res = await put(`/api/events/test-event/stages/${stageId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        label: 'Updated Label',
        starts_at: '2025-01-01T00:00:00Z',
        ends_at: '2025-02-01T00:00:00Z',
      });

    expect(res.status).toBe(200);
    expect(res.body.label).toBe('Updated Label');
    expect(res.body.status).toBe('COMPLETE');
  });

  it('returns 400 for invalid time_policy', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);

    const res = await put(`/api/events/test-event/stages/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ time_policy: 'INVALID' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await put('/api/events/test-event/stages/9999')
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'x' });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/stages/:stageId/reorder
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:slug/stages/:stageId/reorder', () => {
  it('reorders stages correctly', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const s0 = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'A' });
    await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'B' });
    await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...VALID_STAGE, label: 'C' });

    // Move A (index 0) to index 2
    const res = await patch(`/api/events/test-event/stages/${s0.body.id}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage_index: 2 });

    expect(res.status).toBe(200);
    expect(res.body.stage_index).toBe(2);

    // B and C should now be at 0 and 1
    const listRes = await get('/api/events/test-event/stages').set(
      'Authorization',
      `Bearer ${token}`,
    );
    const labels = listRes.body.map((s: { label: string }) => s.label);
    expect(labels).toEqual(['B', 'C', 'A']);
  });

  it('returns 400 for invalid stage_index', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);

    const res = await patch(`/api/events/test-event/stages/${created.body.id}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stage_index: -1 });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stages/:stageId
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/stages/:stageId', () => {
  it('deletes a stage with no results', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${token}`)
      .send(VALID_STAGE);
    const stageId = created.body.id;

    const res = await del(`/api/events/test-event/stages/${stageId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(204);

    const getRes = await get(`/api/events/test-event/stages/${stageId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(getRes.status).toBe(404);
  });

  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createEvent(token);

    const res = await del('/api/events/test-event/stages/9999').set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const created = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send(VALID_STAGE);
    const { token: userToken } = await createUser('other', 'USER');

    const res = await del(`/api/events/test-event/stages/${created.body.id}`).set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Superadmin bypass
// ---------------------------------------------------------------------------

describe('superadmin bypass', () => {
  it('superadmin can create and delete stages', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: saToken } = await createUser('sa', 'SUPERADMIN');

    const createRes = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${saToken}`)
      .send(VALID_STAGE);
    expect(createRes.status).toBe(201);

    const delRes = await del(`/api/events/test-event/stages/${createRes.body.id}`).set(
      'Authorization',
      `Bearer ${saToken}`,
    );
    expect(delRes.status).toBe(204);
  });
});
