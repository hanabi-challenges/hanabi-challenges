import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch, del } from '../../support/api';

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

async function createAndPublishEvent(token: string, slug = 'test-event') {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createQueuedStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Queue Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'INDIVIDUAL',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createSelfFormedStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Self Formed Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function register(token: string, slug = 'test-event') {
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/opt-in
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/opt-in', () => {
  it('opts in to a QUEUED stage (solo)', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body.stage_id).toBe(stage.id);
    expect(res.body.partner_user_id).toBeNull();
    expect(res.body.partner_confirmed).toBe(false);
  });

  it('opts in with a partner', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ partner_user_id: bobId });

    expect(res.status).toBe(201);
    expect(res.body.partner_user_id).toBe(bobId);
    expect(res.body.partner_confirmed).toBe(false); // Bob hasn't opted in yet
  });

  it('pair is confirmed when both sides opt in with each other', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ partner_user_id: bobId });

    // Bob opts in pointing at Alice
    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({ partner_user_id: aliceId });

    expect(res.status).toBe(201);
    expect(res.body.partner_confirmed).toBe(true);
  });

  it('returns 409 when user is not registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    // Alice is NOT registered

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('returns 409 when partner is not registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { userId: bobId } = await createUser('bob');
    await register(aliceToken);
    // Bob is NOT registered

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ partner_user_id: bobId });

    expect(res.status).toBe(409);
  });

  it('returns 409 when stage is not QUEUED policy', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createSelfFormedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    expect(res.status).toBe(409);
  });

  it('returns 409 when user opts in twice', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    const res = await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stages/:stageId/opt-in
// ---------------------------------------------------------------------------

describe('DELETE /stages/:stageId/opt-in', () => {
  it('removes an opt-in', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    const res = await del(`/api/events/test-event/stages/${stage.id}/opt-in`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(204);
  });

  it('returns 404 when not opted in', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await del(`/api/events/test-event/stages/${stage.id}/opt-in`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/opt-ins
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/opt-ins', () => {
  it('admin can list all opt-ins', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});
    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${bobToken}`)
      .send({});

    const res = await get(`/api/events/test-event/stages/${stage.id}/opt-ins`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns 403 for a regular user', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/opt-ins`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/opt-ins/me
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/opt-ins/me', () => {
  it('returns the current user opt-in', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    await post(`/api/events/test-event/stages/${stage.id}/opt-in`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({});

    const res = await get(`/api/events/test-event/stages/${stage.id}/opt-ins/me`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.stage_id).toBe(stage.id);
  });

  it('returns 404 when user has not opted in', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/opt-ins/me`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(404);
  });
});
