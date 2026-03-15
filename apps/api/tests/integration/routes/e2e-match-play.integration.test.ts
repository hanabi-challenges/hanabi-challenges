/**
 * T-072 — End-to-end integration test: MATCH_PLAY
 *
 * Full happy-path bracket lifecycle:
 * 1. Create MATCH_PLAY stage with 4 enrolled teams (seeded)
 * 2. Run single-elimination draw — verify 2 round-1 matches created
 * 3. Submit results for both round-1 matches
 * 4. Advance bracket — verify 1 final match created with correct teams
 * 5. Submit final match result
 * 6. Verify champion identified
 * 7. Trigger award evaluation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch, put } from '../../support/api';

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
      slug: 'e2e-match',
      name: 'E2E Match Play Event',
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch('/api/events/e2e-match/publish').set('Authorization', `Bearer ${token}`);
}

async function createMatchPlayStage(token: string) {
  const res = await post('/api/events/e2e-match/stages')
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Bracket',
      mechanism: 'MATCH_PLAY',
      team_policy: 'SELF_FORMED',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function register(token: string) {
  return post('/api/events/e2e-match/register').set('Authorization', `Bearer ${token}`);
}

async function createAndConfirmTeam(
  aliceToken: string,
  bobToken: string,
  bobId: number,
  stageId: number,
) {
  const res = await post(`/api/events/e2e-match/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${aliceToken}`)
    .send({ invite_user_ids: [bobId] });
  await post(`/api/events/e2e-match/teams/${res.body.id}/confirm`).set(
    'Authorization',
    `Bearer ${bobToken}`,
  );
  return res.body as { id: number };
}

async function completeMatchWithWinner(
  token: string,
  stageId: number,
  matchId: number,
  winnerId: number,
) {
  await put(`/api/events/e2e-match/stages/${stageId}/matches/${matchId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'IN_PROGRESS' });
  await put(`/api/events/e2e-match/stages/${stageId}/matches/${matchId}/status`)
    .set('Authorization', `Bearer ${token}`)
    .send({ status: 'COMPLETE' });
  await patch(`/api/events/e2e-match/stages/${stageId}/matches/${matchId}/winner`)
    .set('Authorization', `Bearer ${token}`)
    .send({ winner_team_id: winnerId });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// E2E: Full MATCH_PLAY bracket lifecycle with award evaluation
// ---------------------------------------------------------------------------

describe('E2E MATCH_PLAY — single-elimination bracket with award evaluation', () => {
  it('runs a 4-team bracket to completion and grants champion award', async () => {
    // 1. Create event and stage
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    // 2. Register 4 teams (8 players)
    const { token: a1Token } = await createUser('alice');
    const { token: a2Token, userId: a2Id } = await createUser('bob');
    const { token: b1Token } = await createUser('carol');
    const { token: b2Token, userId: b2Id } = await createUser('dave');
    const { token: c1Token } = await createUser('eve');
    const { token: c2Token, userId: c2Id } = await createUser('frank');
    const { token: d1Token } = await createUser('grace');
    const { token: d2Token, userId: d2Id } = await createUser('henry');

    for (const t of [a1Token, a2Token, b1Token, b2Token, c1Token, c2Token, d1Token, d2Token]) {
      await register(t);
    }

    const teamA = await createAndConfirmTeam(a1Token, a2Token, a2Id, stage.id);
    const teamB = await createAndConfirmTeam(b1Token, b2Token, b2Id, stage.id);
    const teamC = await createAndConfirmTeam(c1Token, c2Token, c2Id, stage.id);
    const teamD = await createAndConfirmTeam(d1Token, d2Token, d2Id, stage.id);

    // 3. Run the bracket draw (inserts round-1 matches)
    const drawRes = await post(`/api/events/e2e-match/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    expect(drawRes.status).toBe(200);

    // Verify 2 round-1 matches were created
    const standingsAfterDraw = await get(`/api/events/e2e-match/stages/${stage.id}/leaderboard`);
    expect(standingsAfterDraw.body.rounds).toHaveLength(1);
    expect(standingsAfterDraw.body.rounds[0].matches).toHaveLength(2);

    const round1Matches = standingsAfterDraw.body.rounds[0].matches as Array<{
      id: number;
      team1_id: number;
      team2_id: number;
    }>;

    // 4. Submit both round-1 results
    // Determine winners: teamA beats whoever they face; teamB beats whoever they face
    const match1 = round1Matches[0];
    const match2 = round1Matches[1];

    // Pick winners that include teamA and teamB so we have known finalists
    const match1Winner = [teamA.id, teamB.id].includes(match1.team1_id)
      ? match1.team1_id
      : match1.team2_id;
    const match2Winner =
      match1Winner === teamA.id
        ? // teamA won match1, so winner of match2 is whoever faces in match2 that we want as finalist
          [teamB.id].includes(match2.team1_id)
          ? match2.team1_id
          : match2.team2_id
        : [teamA.id].includes(match2.team1_id)
          ? match2.team1_id
          : match2.team2_id;

    await completeMatchWithWinner(ownerToken, stage.id, match1.id, match1Winner);
    await completeMatchWithWinner(ownerToken, stage.id, match2.id, match2Winner);

    // 5. Advance bracket — verify 1 final match created
    const advRes = await post(`/api/events/e2e-match/stages/${stage.id}/bracket/advance`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    expect(advRes.status).toBe(200);

    const standingsAfterAdvance = await get(`/api/events/e2e-match/stages/${stage.id}/leaderboard`);
    expect(standingsAfterAdvance.body.rounds).toHaveLength(2);
    expect(standingsAfterAdvance.body.rounds[1].matches).toHaveLength(1);

    const finalMatch = standingsAfterAdvance.body.rounds[1].matches[0] as {
      id: number;
      team1_id: number;
      team2_id: number;
    };
    expect([match1Winner, match2Winner]).toContain(finalMatch.team1_id);
    expect([match1Winner, match2Winner]).toContain(finalMatch.team2_id);

    // 6. Submit final match — match1Winner wins the final
    await completeMatchWithWinner(ownerToken, stage.id, finalMatch.id, match1Winner);

    // Verify champion identified
    const finalStandings = await get(`/api/events/e2e-match/stages/${stage.id}/leaderboard`);
    expect(finalStandings.status).toBe(200);
    expect(finalStandings.body.current_round).toBeNull();

    const champion = finalStandings.body.entries.find(
      (e: { status: string }) => e.status === 'champion',
    );
    expect(champion).toBeDefined();
    expect(champion.team.id).toBe(match1Winner);
    expect(champion.placement).toBe(1);

    const allTeamIds = [teamA.id, teamB.id, teamC.id, teamD.id];
    const eliminated = finalStandings.body.entries.filter(
      (e: { status: string }) => e.status === 'eliminated',
    );
    expect(eliminated).toHaveLength(3);
    eliminated.forEach((e: { team: { id: number } }) => {
      expect(allTeamIds).toContain(e.team.id);
    });

    // 7. Create champion award and evaluate
    const awardRes = await post('/api/events/e2e-match/awards')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Champion',
        stage_id: stage.id,
        criteria_type: 'RANK_POSITION',
        criteria_value: { positions: [1] },
        attribution: 'TEAM',
      });
    expect(awardRes.status).toBe(201);
    const awardId = awardRes.body.id as number;

    const evalRes = await post('/api/events/e2e-match/awards/evaluate')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ stage_id: stage.id });
    expect(evalRes.status).toBe(200);
    expect(evalRes.body.grants_created).toBe(2); // both members of champion team

    const grantsRes = await get(`/api/events/e2e-match/awards/${awardId}/grants`);
    expect(grantsRes.status).toBe(200);
    expect(grantsRes.body).toHaveLength(2);
  });
});
