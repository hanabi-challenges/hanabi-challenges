/**
 * T-071 — End-to-end integration test: SEEDED_LEADERBOARD
 *
 * Full happy-path scenario:
 * 1. Create event with 2 SEEDED_LEADERBOARD stages + ALL stage relationship
 * 2. Create game slots for both stages
 * 3. Register two teams
 * 4. Submit results for stage 1
 * 5. Query stage 1 leaderboard — verify rankings
 * 6. Query event aggregate — verify aggregate
 * 7. Trigger award evaluation — verify grants
 * 8. Register teams for stage 2 (auto-qualified via ALL relationship)
 * 9. Submit results for stage 2
 * 10. Verify updated aggregate
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'HOST' | 'USER' = 'USER') {
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

async function createAndPublishEvent(token: string) {
  await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug: 'e2e-seeded',
      name: 'E2E Seeded Event',
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch('/api/events/e2e-seeded/publish').set('Authorization', `Bearer ${token}`);
}

async function createSeededStage(token: string, label: string) {
  const res = await post('/api/events/e2e-seeded/stages')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label,
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'TEAM',
      team_scope: 'EVENT',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createGame(token: string, stageId: number, gameIndex: number) {
  const res = await post(`/api/events/e2e-seeded/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: gameIndex, max_score: 25 });
  return res.body as { id: number };
}

async function register(token: string) {
  return post('/api/events/e2e-seeded/register').set('Authorization', `Bearer ${token}`);
}

async function createAndConfirmTeam(aliceToken: string, bobToken: string, bobId: number) {
  const res = await post(`/api/events/e2e-seeded/teams`)
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ invite_user_ids: [bobId] });
  await post(`/api/events/e2e-seeded/teams/${res.body.id}/confirm`).set(
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
) {
  return post(`/api/events/e2e-seeded/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({ team_id: teamId, score });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// E2E: Full SEEDED_LEADERBOARD happy path
// ---------------------------------------------------------------------------

describe('E2E SEEDED_LEADERBOARD — two stages with ALL relationship', () => {
  it('runs the full scenario: register → submit → leaderboard → aggregate → awards → stage 2', async () => {
    // 1. Create event and stages
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage1 = await createSeededStage(ownerToken, 'Stage 1');
    const stage2 = await createSeededStage(ownerToken, 'Stage 2');

    // Add ALL stage relationship: stage 1 qualifies everyone to stage 2
    await post(`/api/events/e2e-seeded/stages/${stage2.id}/relationships`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ prerequisite_stage_id: stage1.id, relationship_type: 'ALL' });

    // 2. Create game slots
    const game1 = await createGame(ownerToken, stage1.id, 1);
    const game2 = await createGame(ownerToken, stage2.id, 1);

    // 3. Register two teams (4 players)
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);

    const team1 = await createAndConfirmTeam(aliceToken, bobToken, bobId);
    const team2 = await createAndConfirmTeam(carolToken, daveToken, daveId);

    // 4. Submit results for stage 1 — team2 scores higher
    await submitResult(aliceToken, stage1.id, game1.id, team1.id, 18);
    await submitResult(carolToken, stage1.id, game1.id, team2.id, 22);

    // 5. Query stage 1 leaderboard
    const lbRes = await get(`/api/events/e2e-seeded/stages/${stage1.id}/leaderboard`);
    expect(lbRes.status).toBe(200);
    expect(lbRes.body.entries).toHaveLength(2);
    expect(lbRes.body.entries[0].team.id).toBe(team2.id);
    expect(lbRes.body.entries[0].rank).toBe(1);
    expect(lbRes.body.entries[0].stage_score).toBe(22);
    expect(lbRes.body.entries[1].rank).toBe(2);
    expect(lbRes.body.entries[1].stage_score).toBe(18);

    // 6. Query aggregate leaderboard
    const aggRes = await get('/api/events/e2e-seeded/leaderboard');
    expect(aggRes.status).toBe(200);
    const aggEntries = aggRes.body.tracks[0].entries as Array<{
      rank: number;
      total_score: number;
      team: { members: { display_name: string }[] };
    }>;
    expect(aggEntries.length).toBeGreaterThanOrEqual(2);
    const carolAgg = aggEntries.find((e) => e.team.members.some((m) => m.display_name === 'carol'));
    const aliceAgg = aggEntries.find((e) => e.team.members.some((m) => m.display_name === 'alice'));
    expect(carolAgg!.total_score).toBe(22);
    expect(carolAgg!.rank).toBe(1);
    expect(aliceAgg!.total_score).toBe(18);
    expect(aliceAgg!.rank).toBeGreaterThan(1);

    // 7. Create a RANK_POSITION award (1st place) and evaluate
    const awardRes = await post('/api/events/e2e-seeded/awards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Stage 1 Champion',
        stage_id: stage1.id,
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        attribution: 'TEAM',
      });
    expect(awardRes.status).toBe(201);
    const awardId = awardRes.body.id as number;

    const evalRes = await post('/api/events/e2e-seeded/awards/evaluate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ stage_id: stage1.id });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.grants_created).toBe(2); // both members of team2

    // Verify grants exist for carol and dave
    const grantsRes = await get(`/api/events/e2e-seeded/awards/${awardId}/grants`);
    expect(grantsRes.status).toBe(200);
    expect(grantsRes.body).toHaveLength(2);

    // 8. Stage 2 uses event-scoped teams — team1 and team2 are reused (ALL relationship)

    // 9. Submit results for stage 2 — team1 wins this time
    await submitResult(aliceToken, stage2.id, game2.id, team1.id, 24);
    await submitResult(carolToken, stage2.id, game2.id, team2.id, 20);

    // 10. Verify updated aggregate
    const agg2Res = await get('/api/events/e2e-seeded/leaderboard');
    expect(agg2Res.status).toBe(200);
    const agg2Entries = agg2Res.body.tracks[0].entries as Array<{
      total_score: number;
      stage_scores: unknown[];
      team: { members: { display_name: string }[] };
    }>;
    const carolAgg2 = agg2Entries.find((e) =>
      e.team.members.some((m) => m.display_name === 'carol'),
    );
    const aliceAgg2 = agg2Entries.find((e) =>
      e.team.members.some((m) => m.display_name === 'alice'),
    );
    // alice: 18 + 24 = 42; carol: 22 + 20 = 42 (tied)
    expect(aliceAgg2!.total_score).toBe(42);
    expect(carolAgg2!.total_score).toBe(42);
    // stage_scores should have 2 entries per player
    expect(aliceAgg2!.stage_scores).toHaveLength(2);
  });
});
