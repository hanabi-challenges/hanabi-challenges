/**
 * T-073 — End-to-end integration test: GAUNTLET
 *
 * Full gauntlet attempt flow:
 * 1. Create GAUNTLET stage with 3 sequential game slots
 * 2. Register a team
 * 3. Start attempt 1, submit games in order, complete attempt
 * 4. Start attempt 2, submit games, complete with higher total score
 * 5. Query leaderboard — verify attempt 2 is shown as best
 * 6. Abandon attempt 3 mid-way — verify it does not appear on leaderboard
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch, del } from '../../support/api';

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

async function createAndPublishEvent(token: string) {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug: 'e2e-gauntlet',
      name: 'E2E Gauntlet Event',
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch('/api/events/e2e-gauntlet/publish').set('Authorization', `Bearer ${token}`);
}

async function createGauntletStage(token: string) {
  const res = await post('/api/events/e2e-gauntlet/stages')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Gauntlet',
      mechanism: 'GAUNTLET',
      team_policy: 'SELF_FORMED',
      team_scope: 'STAGE',
      attempt_policy: 'BEST_OF_N',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createGame(token: string, stageId: number, gameIndex: number) {
  const res = await post(`/api/events/e2e-gauntlet/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: gameIndex, max_score: 25 });
  return res.body as { id: number };
}

async function register(token: string) {
  return post('/api/events/e2e-gauntlet/register').set('Authorization', `Bearer ${token}`);
}

async function createAndConfirmTeam(
  aliceToken: string,
  bobToken: string,
  bobId: number,
  stageId: number,
) {
  const res = await post(`/api/events/e2e-gauntlet/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ invite_user_ids: [bobId] });
  await post(`/api/events/e2e-gauntlet/teams/${res.body.id}/confirm`).set(
    'Authorization',
    `Bearer ${bobToken}`,
  );
  return res.body as { id: number };
}

async function startAttempt(token: string, stageId: number) {
  const res = await post(`/api/events/e2e-gauntlet/stages/${stageId}/attempts`).set(
    'Authorization',
    `Bearer ${token}`,
  );
  return res.body as { id: number };
}

async function submitGame(
  token: string,
  stageId: number,
  gameId: number,
  teamId: number,
  score: number,
  attemptId: number,
) {
  return post(`/api/events/e2e-gauntlet/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({ team_id: teamId, score, attempt_id: attemptId });
}

async function completeAttempt(token: string, stageId: number, attemptId: number) {
  return post(`/api/events/e2e-gauntlet/stages/${stageId}/attempts/${attemptId}/complete`).set(
    'Authorization',
    `Bearer ${token}`,
  );
}

async function abandonAttempt(token: string, stageId: number, attemptId: number) {
  return del(`/api/events/e2e-gauntlet/stages/${stageId}/attempts/${attemptId}`).set(
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
// E2E: Full GAUNTLET scenario
// ---------------------------------------------------------------------------

describe('E2E GAUNTLET — sequential games, multiple attempts, abandon', () => {
  it('runs the full scenario: attempt1 → attempt2 (better) → attempt3 abandoned', async () => {
    // 1. Create event with 3-game gauntlet stage
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 1);
    const game2 = await createGame(ownerToken, stage.id, 2);
    const game3 = await createGame(ownerToken, stage.id, 3);

    // 2. Register team
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);

    // 3. Attempt 1: submit all 3 games sequentially, then complete
    const attempt1 = await startAttempt(aliceToken, stage.id);

    await submitGame(aliceToken, stage.id, game1.id, team.id, 20, attempt1.id);
    await submitGame(aliceToken, stage.id, game2.id, team.id, 18, attempt1.id);
    await submitGame(aliceToken, stage.id, game3.id, team.id, 15, attempt1.id);

    const complete1Res = await completeAttempt(aliceToken, stage.id, attempt1.id);
    expect(complete1Res.status).toBe(200);
    expect(complete1Res.body.total_score).toBe(53); // 20 + 18 + 15

    // Check leaderboard shows attempt 1 as best
    const lb1 = await get(`/api/events/e2e-gauntlet/stages/${stage.id}/leaderboard`);
    expect(lb1.status).toBe(200);
    expect(lb1.body.entries).toHaveLength(1);
    expect(lb1.body.entries[0].stage_score).toBe(53);
    expect(lb1.body.entries[0].best_attempt_number).toBe(1);
    expect(lb1.body.entries[0].dnf).toBe(false);

    // 4. Attempt 2: submit with higher scores
    const attempt2 = await startAttempt(aliceToken, stage.id);

    await submitGame(aliceToken, stage.id, game1.id, team.id, 24, attempt2.id);
    await submitGame(aliceToken, stage.id, game2.id, team.id, 23, attempt2.id);
    await submitGame(aliceToken, stage.id, game3.id, team.id, 22, attempt2.id);

    const complete2Res = await completeAttempt(aliceToken, stage.id, attempt2.id);
    expect(complete2Res.status).toBe(200);
    expect(complete2Res.body.total_score).toBe(69); // 24 + 23 + 22

    // 5. Verify leaderboard shows attempt 2 as best
    const lb2 = await get(`/api/events/e2e-gauntlet/stages/${stage.id}/leaderboard`);
    expect(lb2.status).toBe(200);
    expect(lb2.body.entries).toHaveLength(1);
    expect(lb2.body.entries[0].stage_score).toBe(69);
    expect(lb2.body.entries[0].best_attempt_number).toBe(2);

    // 6. Start attempt 3 but abandon mid-way (only submit 1 game)
    const attempt3 = await startAttempt(aliceToken, stage.id);
    await submitGame(aliceToken, stage.id, game1.id, team.id, 25, attempt3.id);
    // Abandon before completing
    const abandonRes = await abandonAttempt(aliceToken, stage.id, attempt3.id);
    expect(abandonRes.status).toBe(204);

    // Leaderboard still shows attempt 2 as best; attempt 3 does not appear
    const lb3 = await get(`/api/events/e2e-gauntlet/stages/${stage.id}/leaderboard`);
    expect(lb3.status).toBe(200);
    expect(lb3.body.entries).toHaveLength(1);
    expect(lb3.body.entries[0].stage_score).toBe(69);
    expect(lb3.body.entries[0].best_attempt_number).toBe(2);
    // No DNF entry because team has a completed attempt
    expect(lb3.body.entries[0].dnf).toBe(false);
  });
});
