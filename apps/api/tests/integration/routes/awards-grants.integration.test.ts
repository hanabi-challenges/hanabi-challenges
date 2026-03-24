import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, del } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'ADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET role = $1 WHERE display_name = $2`, [role, displayName]);
    const elevated = await loginOrCreateUser(displayName, 'password');
    return { token: elevated.token, userId: elevated.user.id };
  }
  const result = await loginOrCreateUser(displayName, 'password');
  return { token, userId: result.user.id };
}

async function setupEvent(adminToken: string, slug = 'test-event') {
  await post('/api/events')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2] });
  // Don't publish — admin can still access
}

async function publishEvent(adminToken: string, slug = 'test-event') {
  const { patch } = await import('../../support/api');
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${adminToken}`);
}

async function createStage(adminToken: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${adminToken}`)
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

async function createGame(adminToken: string, stageId: number, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ game_index: 1, max_score: 25 });
  return res.body as { id: number };
}

async function registerAndFormTeam(
  adminToken: string,
  slug: string,
  stageId: number,
  userAToken: string,
  userBToken: string,
  userBId: number,
) {
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${userAToken}`);
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${userBToken}`);
  const teamRes = await post(`/api/events/${slug}/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${userAToken}`)
    .send({ invite_user_ids: [userBId] });
  await post(`/api/events/${slug}/teams/${teamRes.body.id}/confirm`).set(
    'Authorization',
    `Bearer ${userBToken}`,
  );
  return teamRes.body as { id: number };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards/evaluate
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/awards/evaluate', () => {
  it('returns 401 for unauthenticated', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const res = await post('/api/events/test-event/awards/evaluate').send({});
    expect(res.status).toBe(401);
  });

  it('returns empty grants when no qualifying scores', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    await publishEvent(token);

    const stage = await createStage(token);
    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '1st Place',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });

    const res = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${token}`)
      .send({ stage_id: stage.id });
    expect(res.status).toBe(200);
    expect(res.body.grants_created).toBe(0);
  });

  it('grants RANK_POSITION award to top team members', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const game = await createGame(adminToken, stage.id);

    const team = await registerAndFormTeam(
      adminToken,
      'test-event',
      stage.id,
      aliceToken,
      bobToken,
      bobId,
    );

    // Submit a result
    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    // Create the award
    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gold',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });

    const res = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });
    expect(res.status).toBe(200);
    // Team has 2 members → 2 grants
    expect(res.body.grants_created).toBe(2);
  });

  it('is idempotent — second evaluate creates no new grants', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const game = await createGame(adminToken, stage.id);
    const team = await registerAndFormTeam(
      adminToken,
      'test-event',
      stage.id,
      aliceToken,
      bobToken,
      bobId,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gold',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });

    // First run
    await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });

    // Second run — no new grants
    const res2 = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });
    expect(res2.status).toBe(200);
    expect(res2.body.grants_created).toBe(0);
  });

  it('grants SCORE_THRESHOLD award to teams meeting min_score', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const game = await createGame(adminToken, stage.id);
    const team = await registerAndFormTeam(
      adminToken,
      'test-event',
      stage.id,
      aliceToken,
      bobToken,
      bobId,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'High Score',
        criteria_type: 'SCORE_THRESHOLD',
        criteria_value: { min_score: 18 },
        stage_id: stage.id,
      });

    const res = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });
    expect(res.status).toBe(200);
    expect(res.body.grants_created).toBe(2); // alice + bob
  });

  it('does not grant SCORE_THRESHOLD to teams below threshold', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const game = await createGame(adminToken, stage.id);
    const team = await registerAndFormTeam(
      adminToken,
      'test-event',
      stage.id,
      aliceToken,
      bobToken,
      bobId,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 10 });

    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'High Score',
        criteria_type: 'SCORE_THRESHOLD',
        criteria_value: { min_score: 20 },
        stage_id: stage.id,
      });

    const res = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });
    expect(res.status).toBe(200);
    expect(res.body.grants_created).toBe(0);
  });

  it('does not auto-evaluate MANUAL awards', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const game = await createGame(adminToken, stage.id);
    const team = await registerAndFormTeam(
      adminToken,
      'test-event',
      stage.id,
      aliceToken,
      bobToken,
      bobId,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 25 });

    await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit Award', criteria_type: 'MANUAL', stage_id: stage.id });

    const res = await post('/api/events/test-event/awards/evaluate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stage_id: stage.id });
    expect(res.status).toBe(200);
    expect(res.body.grants_created).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/awards/:awardId/grants
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/awards/:awardId/grants', () => {
  it('returns empty list when no grants', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    await publishEvent(token);
    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', criteria_type: 'MANUAL' });

    const res = await get(`/api/events/test-event/awards/${awardRes.body.id}/grants`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns grants after manual grant', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { userId: aliceId } = await createUser('alice');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit', criteria_type: 'MANUAL' });
    const awardId = awardRes.body.id;

    await post(`/api/events/test-event/awards/${awardId}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });

    const res = await get(`/api/events/test-event/awards/${awardId}/grants`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].user_id).toBe(aliceId);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/awards/me/grants
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/awards/me/grants', () => {
  it('returns 401 for unauthenticated', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    await publishEvent(token);
    const res = await get('/api/events/test-event/awards/me/grants');
    expect(res.status).toBe(401);
  });

  it('returns current user grants', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit', criteria_type: 'MANUAL' });
    const awardId = awardRes.body.id;

    await post(`/api/events/test-event/awards/${awardId}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });

    const res = await get('/api/events/test-event/awards/me/grants').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].award_id).toBe(awardId);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/awards/:awardId/grants (manual)
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/awards/:awardId/grants', () => {
  it('rejects manual grant for non-MANUAL award', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { userId: aliceId } = await createUser('alice');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const stage = await createStage(adminToken);
    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Gold',
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        stage_id: stage.id,
      });

    const res = await post(`/api/events/test-event/awards/${awardRes.body.id}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/MANUAL/);
  });

  it('rejects duplicate grant', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { userId: aliceId } = await createUser('alice');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit', criteria_type: 'MANUAL' });
    const awardId = awardRes.body.id;

    await post(`/api/events/test-event/awards/${awardId}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });

    const res = await post(`/api/events/test-event/awards/${awardId}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });
    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/awards/:awardId/grants/:grantId
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/awards/:awardId/grants/:grantId', () => {
  it('revokes a grant', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    const { userId: aliceId } = await createUser('alice');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit', criteria_type: 'MANUAL' });
    const awardId = awardRes.body.id;

    const grantRes = await post(`/api/events/test-event/awards/${awardId}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: aliceId });
    const grantId = grantRes.body.id;

    const res = await del(`/api/events/test-event/awards/${awardId}/grants/${grantId}`).set(
      'Authorization',
      `Bearer ${adminToken}`,
    );
    expect(res.status).toBe(204);

    const list = await get(`/api/events/test-event/awards/${awardId}/grants`);
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown grant', async () => {
    const { token: adminToken } = await createUser('owner', 'ADMIN');
    await setupEvent(adminToken);
    await publishEvent(adminToken);

    const awardRes = await post('/api/events/test-event/awards')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Spirit', criteria_type: 'MANUAL' });

    const res = await del(`/api/events/test-event/awards/${awardRes.body.id}/grants/9999`).set(
      'Authorization',
      `Bearer ${adminToken}`,
    );
    expect(res.status).toBe(404);
  });
});
