import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { post, put, del, patch } from '../../support/api';

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
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2] });
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

async function createGame(token: string, stageId: number, maxScore = 25, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: 1, max_score: maxScore });
  return res.body as { id: number };
}

async function register(token: string, slug = 'test-event') {
  return post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

async function createTeamAndConfirm(
  aliceToken: string,
  bobToken: string,
  bobId: number,
  stageId: number,
  slug = 'test-event',
) {
  const res = await post(`/api/events/${slug}/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ invite_user_ids: [bobId] });
  await post(`/api/events/${slug}/teams/${res.body.id}/confirm`).set(
    'Authorization',
    `Bearer ${bobToken}`,
  );
  return res.body as { id: number };
}

async function submitResult(
  token: string,
  stageId: number,
  gameId: number,
  teamId: number,
  score: number,
  slug = 'test-event',
) {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({ team_id: teamId, score });
  return res.body as { id: number };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug/results/:resultId
// ---------------------------------------------------------------------------

describe('PUT /events/:slug/results/:resultId', () => {
  it('admin updates a result score', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    const res = await put(`/api/events/test-event/results/${result.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ score: 23 });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(23);
    expect(res.body.corrected_by).toBeTruthy();
    expect(res.body.corrected_at).toBeTruthy();
  });

  it('preserves unchanged fields when only updating score', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    // First set a hanabi_live_game_id
    await put(`/api/events/test-event/results/${result.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ score: 20, hanabi_live_game_id: 12345 });

    // Now update only score — hanabi_live_game_id should be preserved
    const res = await put(`/api/events/test-event/results/${result.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ score: 22 });

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(22);
    // BIGINT returned as string by node-postgres
    expect(Number(res.body.hanabi_live_game_id)).toBe(12345);
  });

  it('returns 400 when score exceeds max_score', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    const res = await put(`/api/events/test-event/results/${result.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ score: 30 });

    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-existent result', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);

    const res = await put('/api/events/test-event/results/9999')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ score: 20 });

    expect(res.status).toBe(404);
  });

  it('returns 403 for a regular user', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    const res = await put(`/api/events/test-event/results/${result.id}`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ score: 22 });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/results/:resultId
// ---------------------------------------------------------------------------

describe('DELETE /events/:slug/results/:resultId', () => {
  it('admin deletes a result', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    const res = await del(`/api/events/test-event/results/${result.id}`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(204);

    // Verify participants also deleted (cascade)
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_game_result_participants WHERE game_result_id = $1`,
      [result.id],
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('returns 404 for a non-existent result', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);

    const res = await del('/api/events/test-event/results/9999').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(404);
  });

  it('returns 403 for a regular user', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const result = await submitResult(aliceToken, stage.id, game.id, team.id, 20);

    const res = await del(`/api/events/test-event/results/${result.id}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(403);
  });
});
