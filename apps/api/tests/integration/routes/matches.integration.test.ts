import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, patch } from '../../support/api';

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

async function createAndPublishEvent(token: string, slug = 'test-event') {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2] });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createMatchPlayStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Match Stage',
      mechanism: 'MATCH_PLAY',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
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

/** Insert a match directly since bracket draw (T-042) isn't implemented yet */
async function insertMatch(stageId: number, team1Id: number, team2Id: number, roundNumber = 1) {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO event_matches (stage_id, round_number, team1_id, team2_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [stageId, roundNumber, team1Id, team2Id],
  );
  return res.rows[0].id;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /matches
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/matches', () => {
  it('lists all matches for a stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);

    await insertMatch(stage.id, team1.id, team2.id);

    const res = await get(`/api/events/test-event/stages/${stage.id}/matches`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].round_number).toBe(1);
    expect(res.body[0].status).toBe('PENDING');
    expect(res.body[0].team1_display_name).toBeTruthy();
  });

  it('returns empty array when no matches exist', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/matches`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GET /matches/:matchId
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/matches/:matchId', () => {
  it('returns match detail with game_results array', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);

    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await get(`/api/events/test-event/stages/${stage.id}/matches/${matchId}`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(matchId);
    expect(res.body.game_results).toEqual([]);
  });

  it('returns 404 for unknown match', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/matches/9999`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /matches/:matchId/status
// ---------------------------------------------------------------------------

describe('PUT /stages/:stageId/matches/:matchId/status', () => {
  it('transitions PENDING → IN_PROGRESS → COMPLETE', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const r1 = await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'IN_PROGRESS' });
    expect(r1.status).toBe(200);
    expect(r1.body.status).toBe('IN_PROGRESS');

    const r2 = await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'COMPLETE' });
    expect(r2.status).toBe(200);
    expect(r2.body.status).toBe('COMPLETE');
  });

  it('returns 409 for backward transition (COMPLETE → PENDING)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    // Move to COMPLETE
    await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'IN_PROGRESS' });
    await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'COMPLETE' });

    // Try going back
    const res = await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'PENDING' });

    expect(res.status).toBe(409);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const { token: charlieToken } = await createUser('charlie');
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /matches/:matchId/results
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/matches/:matchId/results', () => {
  it('submits a game result and auto-computes winner', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ game_index: 1, team1_score: 22, team2_score: 18 });

    expect(res.status).toBe(201);
    expect(res.body.winner_team_id).toBe(team1.id);
    expect(res.body.game_results).toHaveLength(1);
    expect(res.body.game_results[0].team1_score).toBe(22);
  });

  it('winner is null when scores are tied', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ game_index: 1, team1_score: 20, team2_score: 20 });

    expect(res.status).toBe(201);
    expect(res.body.winner_team_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /matches/:matchId/winner
// ---------------------------------------------------------------------------

describe('PATCH /stages/:stageId/matches/:matchId/winner', () => {
  it('admin can override the winner', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/winner`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ winner_team_id: team2.id });

    expect(res.status).toBe(200);
    expect(res.body.winner_team_id).toBe(team2.id);
  });

  it('returns 400 when winner_team_id is not one of the match teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const daveResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveResult.token}`,
    );
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);

    const team1 = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createTeamAndConfirm(charlieToken, daveResult.token, rows[0].id, stage.id);
    const matchId = await insertMatch(stage.id, team1.id, team2.id);

    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/winner`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ winner_team_id: 9999 });

    expect(res.status).toBe(400);
  });
});
