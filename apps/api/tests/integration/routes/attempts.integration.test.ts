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
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2] });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createGauntletStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Gauntlet Stage',
      mechanism: 'GAUNTLET',
      team_policy: 'SELF_FORMED',
      team_scope: 'STAGE',
      attempt_policy: 'BEST_OF_N',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createGame(
  token: string,
  stageId: number,
  gameIndex: number,
  maxScore = 25,
  slug = 'test-event',
) {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: gameIndex, max_score: maxScore });
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

async function startAttempt(token: string, stageId: number, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages/${stageId}/attempts`).set(
    'Authorization',
    `Bearer ${token}`,
  );
  return res.body as { id: number; attempt_number: number };
}

async function submitResult(
  token: string,
  stageId: number,
  gameId: number,
  teamId: number,
  score: number,
  attemptId?: number,
  slug = 'test-event',
) {
  return post(`/api/events/${slug}/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      team_id: teamId,
      score,
      ...(attemptId !== undefined ? { attempt_id: attemptId } : {}),
    });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/attempts
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/attempts', () => {
  it('starts a new attempt', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.attempt_number).toBe(1);
    expect(res.body.completed).toBe(false);
  });

  it('returns 409 if an in-progress attempt already exists', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    const res = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(409);
  });

  it('returns 409 for non-GAUNTLET stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await (async () => {
      const res = await post('/api/events/test-event/stages')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          label: 'LB Stage',
          mechanism: 'SEEDED_LEADERBOARD',
          team_policy: 'SELF_FORMED',
          team_scope: 'STAGE',
          attempt_policy: 'SINGLE',
          time_policy: 'WINDOW',
        });
      return res.body as { id: number };
    })();

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(409);
  });

  it('can start a second attempt after completing the first', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    const attempt1 = await startAttempt(aliceToken, stage.id);
    await submitResult(aliceToken, stage.id, game.id, team.id, 20, attempt1.id);
    await post(`/api/events/test-event/stages/${stage.id}/attempts/${attempt1.id}/complete`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    const res = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.attempt_number).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Game ordering enforcement
// ---------------------------------------------------------------------------

describe('Game ordering in gauntlet attempts', () => {
  it('rejects submitting game 2 before game 1', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    await createGame(ownerToken, stage.id, 1, 25);
    const game2 = await createGame(ownerToken, stage.id, 2, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    // Try to submit game 2 first (game 1 not done)
    const res = await submitResult(aliceToken, stage.id, game2.id, team.id, 18, attempt.id);
    expect(res.status).toBe(409);
  });

  it('allows submitting game 2 after game 1', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 1, 25);
    const game2 = await createGame(ownerToken, stage.id, 2, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    await submitResult(aliceToken, stage.id, game1.id, team.id, 20, attempt.id);
    const res = await submitResult(aliceToken, stage.id, game2.id, team.id, 18, attempt.id);
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/attempts
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/attempts', () => {
  it('returns own team attempts', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    await startAttempt(aliceToken, stage.id);

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].attempt_number).toBe(1);
  });

  it('admin sees all teams attempts', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    const { userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    const { rows } = await pool.query(`SELECT id FROM users WHERE display_name = 'dave'`);
    const daveId2 = rows[0]?.id ?? daveId;
    const daveTokenResult = await loginOrCreateUser('dave', 'password');
    await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${daveTokenResult.token}`,
    );

    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    await createTeamAndConfirm(charlieToken, daveTokenResult.token, daveId2, stage.id);

    await startAttempt(aliceToken, stage.id);
    await startAttempt(charlieToken, stage.id);

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST /attempts/:attemptId/complete
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/attempts/:attemptId/complete', () => {
  it('completes an attempt and computes total_score', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 1, 25);
    const game2 = await createGame(ownerToken, stage.id, 2, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    await submitResult(aliceToken, stage.id, game1.id, team.id, 20, attempt.id);
    await submitResult(aliceToken, stage.id, game2.id, team.id, 18, attempt.id);

    const res = await post(
      `/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`,
    ).set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
    expect(res.body.total_score).toBe(38);
    expect(res.body.completed_at).toBeTruthy();
  });

  it('returns 409 if not all games submitted', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 1, 25);
    await createGame(ownerToken, stage.id, 2, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    await submitResult(aliceToken, stage.id, game1.id, team.id, 20, attempt.id);
    // game 2 not submitted

    const res = await post(
      `/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`,
    ).set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(409);
  });

  it('returns 409 when already completed', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    await submitResult(aliceToken, stage.id, game.id, team.id, 20, attempt.id);
    await post(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    const res = await post(
      `/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`,
    ).set('Authorization', `Bearer ${aliceToken}`);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// GET /stages/:stageId/attempts/:attemptId
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/attempts/:attemptId', () => {
  it('returns attempt detail with results', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1, 25);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    await submitResult(aliceToken, stage.id, game.id, team.id, 20, attempt.id);

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(attempt.id);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].score).toBe(20);
  });

  it('returns 404 for unknown attempt', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts/9999`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// T-041 — Attempt state machine: abandon + limit enforcement
// ---------------------------------------------------------------------------

describe('DELETE /stages/:stageId/attempts/:attemptId (abandon)', () => {
  it('marks an in-progress attempt as abandoned', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);

    const res = await del(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res.status).toBe(204);
  });

  it('returns 409 if attempt is already completed', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);
    await submitResult(aliceToken, stage.id, game.id, team.id, 20, attempt.id);
    await post(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    const res = await del(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res.status).toBe(409);
  });

  it('returns 404 for unknown attempt', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await del(`/api/events/test-event/stages/${stage.id}/attempts/9999`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// T-042 — Gauntlet best-attempt leaderboard endpoint
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/attempts/leaderboard', () => {
  it('returns best-attempt standings after completion', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);
    const attempt = await startAttempt(aliceToken, stage.id);
    await submitResult(aliceToken, stage.id, game.id, team.id, 22, attempt.id);
    await post(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].stage_score).toBe(22);
  });

  it('returns empty leaderboard for stage with no completed attempts', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);

    const res = await get(`/api/events/test-event/stages/${stage.id}/attempts/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(0);
  });
});

describe('BEST_OF_N attempt limit', () => {
  it('allows starting a new attempt after abandoning (abandoned does not count toward limit)', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    // BEST_OF_N with n=1 in config_json
    const stageRes = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        label: 'BestOf1',
        mechanism: 'GAUNTLET',
        team_policy: 'SELF_FORMED',
        team_scope: 'STAGE',
        attempt_policy: 'BEST_OF_N',
        time_policy: 'WINDOW',
        config_json: { best_of_n: 1 },
      });
    const stage = stageRes.body as { id: number };

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    const attempt = await startAttempt(aliceToken, stage.id);
    // Abandon it — should not count toward the limit
    await del(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    // Can start another one
    const res2 = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res2.status).toBe(201);
  });

  it('blocks attempt when BEST_OF_N limit reached', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stageRes = await post('/api/events/test-event/stages')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        label: 'BestOf1b',
        mechanism: 'GAUNTLET',
        team_policy: 'SELF_FORMED',
        team_scope: 'STAGE',
        attempt_policy: 'BEST_OF_N',
        time_policy: 'WINDOW',
        config_json: { best_of_n: 1 },
      });
    const stage = stageRes.body as { id: number };
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createTeamAndConfirm(aliceToken, bobToken, bobId, stage.id);

    // Use the 1 allowed attempt
    const attempt = await startAttempt(aliceToken, stage.id);
    await submitResult(aliceToken, stage.id, game.id, team.id, 20, attempt.id);
    await post(`/api/events/test-event/stages/${stage.id}/attempts/${attempt.id}/complete`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    // Second attempt should be blocked
    const res2 = await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    expect(res2.status).toBe(409);
  });
});
