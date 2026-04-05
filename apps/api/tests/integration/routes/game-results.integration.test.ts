import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch } from '../../support/api';

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

async function createAndPublishEvent(token: string, slug = 'test-event', teamSizes = [2]) {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: teamSizes,
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

async function createGame(token: string, stageId: number, maxScore = 25, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: 1, max_score: maxScore });
  return res.body as { id: number };
}

async function register(token: string, slug = 'test-event') {
  return post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

async function createTeam(
  token: string,
  stageId: number,
  inviteIds: number[],
  slug = 'test-event',
) {
  const res = await post(`/api/events/${slug}/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${token}`)
    .send({ invite_user_ids: inviteIds });
  return res.body as { id: number };
}

async function confirmTeam(token: string, teamId: number, slug = 'test-event') {
  return post(`/api/events/${slug}/teams/${teamId}/confirm`).set(
    'Authorization',
    `Bearer ${token}`,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/games/:gameId/results
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/games/:gameId/results', () => {
  it('submits a result successfully', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);

    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(20);
    expect(res.body.participants).toHaveLength(2);
  });

  it('returns 400 when score exceeds max_score', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 26 });

    expect(res.status).toBe(400);
  });

  it('returns 400 when score is 0 without zero_reason', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 0 });

    expect(res.status).toBe(400);
  });

  it('accepts score of 0 with zero_reason', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 0, zero_reason: 'Strike Out' });

    expect(res.status).toBe(201);
    expect(res.body.zero_reason).toBe('Strike Out');
  });

  it('returns 409 on duplicate submission', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 22 });

    expect(res.status).toBe(409);
  });

  it('returns 403 when submitter is not on the team', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    // Charlie is not on the team
    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ team_id: team.id, score: 20 });

    expect(res.status).toBe(403);
  });

  it('admin can submit a result for any team', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ team_id: team.id, score: 18 });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/games/:gameId/results
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/games/:gameId/results', () => {
  it('admin sees all results', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    await register(charlieToken); // already registered, idempotent

    // Use pool directly to get dave's userId since we registered charlie above
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);
    const daveRealId = rows[0].id;
    const daveTokenResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveTokenResult.token}`,
    );

    const team1 = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team1.id);
    const team2 = await createTeam(charlieToken, stage.id, [daveRealId]);
    // Dave confirms
    await post(`/api/events/test-event/teams/${team2.id}/confirm`).set(
      'Authorization',
      `Bearer ${daveTokenResult.token}`,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team1.id, score: 20 });
    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ team_id: team2.id, score: 18 });

    const res = await get(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('regular user sees only their own result', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    const res = await get(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/results
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/results', () => {
  it('admin sees all results for the stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 25);
    const game2Res = await post(`/api/events/test-event/stages/${stage.id}/games`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ game_index: 2, max_score: 30 });
    const game2 = game2Res.body as { id: number };

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    await post(`/api/events/test-event/stages/${stage.id}/games/${game1.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });
    await post(`/api/events/test-event/stages/${stage.id}/games/${game2.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 25 });

    const res = await get(`/api/events/test-event/stages/${stage.id}/results`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('user sees only their own stage results', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeam(aliceToken, stage.id, [bobId]);
    await confirmTeam(bobToken, team.id);

    await post(`/api/events/test-event/stages/${stage.id}/games/${game.id}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team.id, score: 20 });

    const res = await get(`/api/events/test-event/stages/${stage.id}/results`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].score).toBe(20);
  });
});
