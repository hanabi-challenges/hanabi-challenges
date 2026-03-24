import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch } from '../../support/api';

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

async function createStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Stage 1',
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
// POST /api/events/:slug/stages/:stageId/teams
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/teams', () => {
  it('creates a stage-scoped team', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    expect(res.status).toBe(201);
    expect(res.body.stage_id).toBe(stage.id);
    expect(res.body.team_size).toBe(2);
    const alice = res.body.members.find((m: { user_id: number }) => m.user_id === aliceId);
    expect(alice?.confirmed).toBe(true);
  });

  it('a user can be on different teams in different stages', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage1 = await createStage(ownerToken);
    const stage2 = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        label: 'Stage 2',
        mechanism: 'SEEDED_LEADERBOARD',
        participation_type: 'TEAM',
        team_scope: 'STAGE',
        attempt_policy: 'SINGLE',
        time_policy: 'WINDOW',
      });

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken, userId: charlieId } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);

    // Alice+Bob in stage 1
    const r1 = await post(`/api/events/test-event/stages/${stage1.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });
    expect(r1.status).toBe(201);

    // Alice+Charlie in stage 2 (different stage, allowed)
    const r2 = await post(`/api/events/test-event/stages/${stage2.body.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [charlieId] });
    expect(r2.status).toBe(201);
    expect(r2.body.stage_id).toBe(stage2.body.id);
  });

  it('returns 409 when a member already has a confirmed team in this stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken, userId: charlieId } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);

    // Alice+Bob: Alice auto-confirms
    const team1 = await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    // Bob confirms
    await post(`/api/events/test-event/teams/${team1.body.id}/confirm`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );

    // Alice tries to create another team in the same stage
    const res = await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [charlieId] });

    expect(res.status).toBe(409);
  });

  it('auto-registers an invited member who is not yet registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { userId: bobId } = await createUser('bob');
    await register(aliceToken);
    // Bob is NOT registered — stage team creation auto-registers him

    const res = await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/teams
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/teams', () => {
  it('admin sees all stage teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const res = await get(`/api/events/test-event/stages/${stage.id}/teams`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].stage_id).toBe(stage.id);
  });

  it('regular user sees only their own stage teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    const { token: daveToken, userId: daveId } = await createUser('dave');

    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    await register(daveToken);

    await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ invite_user_ids: [daveId] });

    // Charlie sees only their team
    const res = await get(`/api/events/test-event/stages/${stage.id}/teams`).set(
      'Authorization',
      `Bearer ${charlieToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(
      res.body[0].members.some((m: { display_name: string }) => m.display_name === 'charlie'),
    ).toBe(true);
  });

  it('returns 404 for unknown stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);

    const res = await get('/api/events/test-event/stages/9999/teams').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/teams/me
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/teams/me', () => {
  it('returns the current user team for this stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const res = await get(`/api/events/test-event/stages/${stage.id}/teams/me`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.stage_id).toBe(stage.id);
  });

  it('returns 404 when user has no team in this stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/teams/me`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(404);
  });
});
