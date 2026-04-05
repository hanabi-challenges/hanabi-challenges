import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch, put } from '../../support/api';

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
    .send({ slug, name: `Event ${slug}`, long_description: 'Test.', allowed_team_sizes: [2, 3] });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createSeededStage(
  token: string,
  slug = 'test-event',
  overrides: Record<string, unknown> = {},
) {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Seeded Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
      ...overrides,
    });
  return res.body as { id: number };
}

async function createGame(token: string, stageId: number, gameIndex: number, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages/${stageId}/games`)
    .set('Authorization', `Bearer ${token}`)
    .send({ game_index: gameIndex, max_score: 25 });
  return res.body as { id: number };
}

async function register(token: string, slug = 'test-event') {
  return post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

async function createAndConfirmTeam(
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
  bdr: number | null = null,
  slug = 'test-event',
) {
  return post(`/api/events/${slug}/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      team_id: teamId,
      score,
      ...(bdr !== null ? { bottom_deck_risk: bdr } : {}),
    });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/leaderboard
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/leaderboard', () => {
  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    const res = await get('/api/events/test-event/stages/999/leaderboard');
    expect(res.status).toBe(404);
  });

  it('returns empty entries when no results submitted', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    const stage = await createSeededStage(token);
    await createGame(token, stage.id, 1);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.combined_leaderboard).toBe(false);
    expect(res.body.entries).toEqual([]);
  });

  it('returns ranked entries after results are submitted', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createSeededStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);

    await submitResult(aliceToken, stage.id, game.id, team.id, 22);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].rank).toBe(1);
    expect(res.body.entries[0].stage_score).toBe(22);
    expect(res.body.entries[0].team.id).toBe(team.id);
  });

  it('sums game scores across multiple games', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createSeededStage(ownerToken);
    const game1 = await createGame(ownerToken, stage.id, 1);
    const game2 = await createGame(ownerToken, stage.id, 2);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);

    await submitResult(aliceToken, stage.id, game1.id, team.id, 20);
    await submitResult(aliceToken, stage.id, game2.id, team.id, 18);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].stage_score).toBe(38);
    expect(res.body.entries[0].game_scores).toHaveLength(2);
  });

  it('ranks multiple teams correctly', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createSeededStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);
    const team1 = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createAndConfirmTeam(carolToken, daveToken, daveId, stage.id);

    await submitResult(aliceToken, stage.id, game.id, team1.id, 20);
    await submitResult(carolToken, stage.id, game.id, team2.id, 25);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries[0].team.id).toBe(team2.id);
    expect(res.body.entries[0].rank).toBe(1);
    expect(res.body.entries[1].team.id).toBe(team1.id);
    expect(res.body.entries[1].rank).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GAUNTLET leaderboard integration tests
// ---------------------------------------------------------------------------

async function createGauntletStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Gauntlet Stage',
      mechanism: 'GAUNTLET',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'BEST_OF_N',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createAndConfirmTeamForGauntlet(
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

async function startAndCompleteAttempt(
  token: string,
  stageId: number,
  teamId: number,
  gameId: number,
  score: number,
  slug = 'test-event',
) {
  const attempt = await post(`/api/events/${slug}/stages/${stageId}/attempts`).set(
    'Authorization',
    `Bearer ${token}`,
  );
  const attemptId = attempt.body.id as number;

  await post(`/api/events/${slug}/stages/${stageId}/games/${gameId}/results`)
    .set('Authorization', `Bearer ${token}`)
    .send({ team_id: teamId, score, attempt_id: attemptId });

  await post(`/api/events/${slug}/stages/${stageId}/attempts/${attemptId}/complete`).set(
    'Authorization',
    `Bearer ${token}`,
  );

  return attemptId;
}

describe('GET /stages/:stageId/leaderboard (GAUNTLET)', () => {
  it('returns empty entries when no attempts', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    const stage = await createGauntletStage(token);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([]);
  });

  it('ranks team with completed attempt', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeamForGauntlet(aliceToken, bobToken, bobId, stage.id);

    await startAndCompleteAttempt(aliceToken, stage.id, team.id, game.id, 20);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].rank).toBe(1);
    expect(res.body.entries[0].stage_score).toBe(20);
    expect(res.body.entries[0].dnf).toBe(false);
    expect(res.body.entries[0].best_attempt_number).toBe(1);
  });

  it('shows only best attempt per team (multiple attempts)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeamForGauntlet(aliceToken, bobToken, bobId, stage.id);

    await startAndCompleteAttempt(aliceToken, stage.id, team.id, game.id, 15);
    await startAndCompleteAttempt(aliceToken, stage.id, team.id, game.id, 22);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].stage_score).toBe(22);
    expect(res.body.entries[0].best_attempt_number).toBe(2);
  });

  it('shows DNF team at bottom (in-progress attempt, no complete)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createGauntletStage(ownerToken);
    await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);
    await createAndConfirmTeamForGauntlet(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createAndConfirmTeamForGauntlet(carolToken, daveToken, daveId, stage.id);

    // team2 starts but never completes
    await post(`/api/events/test-event/stages/${stage.id}/attempts`).set(
      'Authorization',
      `Bearer ${carolToken}`,
    );

    // team1 also has no attempts at all — only team2 shows as DNF (has attempts)
    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    const dnf = res.body.entries.filter((e: { dnf: boolean }) => e.dnf);
    expect(dnf).toHaveLength(1);
    expect(dnf[0].team.id).toBe(team2.id);
    expect(dnf[0].rank).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MATCH_PLAY standings integration tests
// ---------------------------------------------------------------------------

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

async function insertMatch(stageId: number, team1Id: number, team2Id: number, roundNumber = 1) {
  const res = await pool.query<{ id: number }>(
    `INSERT INTO event_matches (stage_id, round_number, team1_id, team2_id)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [stageId, roundNumber, team1Id, team2Id],
  );
  return res.rows[0].id;
}

describe('GET /stages/:stageId/leaderboard (MATCH_PLAY)', () => {
  it('returns empty state when no matches exist', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    const stage = await createMatchPlayStage(token);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.rounds).toEqual([]);
    expect(res.body.entries).toEqual([]);
    expect(res.body.current_round).toBeNull();
  });

  it('returns round data with pending match and active teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);
    const team1 = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createAndConfirmTeam(carolToken, daveToken, daveId, stage.id);

    await insertMatch(stage.id, team1.id, team2.id, 1);

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.rounds).toHaveLength(1);
    expect(res.body.rounds[0].round_number).toBe(1);
    expect(res.body.rounds[0].matches).toHaveLength(1);
    expect(res.body.current_round).toBe(1);
    expect(res.body.entries).toHaveLength(2);
    res.body.entries.forEach((e: { status: string }) => expect(e.status).toBe('active'));
  });

  it('marks eliminated and champion after completed bracket', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);
    const team1 = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createAndConfirmTeam(carolToken, daveToken, daveId, stage.id);

    const matchId = await insertMatch(stage.id, team1.id, team2.id, 1);

    // Complete the match with team1 winning
    await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'IN_PROGRESS' });
    await put(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'COMPLETE' });
    await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/winner`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ winner_team_id: team1.id });

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.current_round).toBeNull(); // all complete

    const champion = res.body.entries.find((e: { status: string }) => e.status === 'champion');
    expect(champion).toBeDefined();
    expect(champion.team.id).toBe(team1.id);
    expect(champion.placement).toBe(1);

    const eliminated = res.body.entries.find((e: { status: string }) => e.status === 'eliminated');
    expect(eliminated).toBeDefined();
    expect(eliminated.team.id).toBe(team2.id);
    expect(eliminated.placement).toBe(2);
  });

  it('handles in-progress round (some matches complete, some pending)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createMatchPlayStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);
    const team1 = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);
    const team2 = await createAndConfirmTeam(carolToken, daveToken, daveId, stage.id);

    const match1Id = await insertMatch(stage.id, team1.id, team2.id, 1);
    // Second match in round 1 (pending)
    const { token: eToken } = await createUser('eve');
    const { token: fToken, userId: fId } = await createUser('frank');
    await register(eToken);
    await register(fToken);
    const team3 = await createAndConfirmTeam(eToken, fToken, fId, stage.id);
    const { token: gToken } = await createUser('grace');
    const { token: hToken, userId: hId } = await createUser('henry');
    await register(gToken);
    await register(hToken);
    const team4 = await createAndConfirmTeam(gToken, hToken, hId, stage.id);
    await insertMatch(stage.id, team3.id, team4.id, 1);

    // Complete only match1 with team1 winning
    await put(`/api/events/test-event/stages/${stage.id}/matches/${match1Id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'IN_PROGRESS' });
    await put(`/api/events/test-event/stages/${stage.id}/matches/${match1Id}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'COMPLETE' });
    await patch(`/api/events/test-event/stages/${stage.id}/matches/${match1Id}/winner`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ winner_team_id: team1.id });

    const res = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(res.status).toBe(200);
    expect(res.body.current_round).toBe(1); // round 1 still has a pending match

    const team2entry = res.body.entries.find(
      (e: { team: { id: number } }) => e.team.id === team2.id,
    );
    expect(team2entry.status).toBe('eliminated');

    const team1entry = res.body.entries.find(
      (e: { team: { id: number } }) => e.team.id === team1.id,
    );
    expect(team1entry.status).toBe('active'); // won but round not yet done
  });
});

// ---------------------------------------------------------------------------
// Aggregate event leaderboard integration tests
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/leaderboard', () => {
  it('returns 404 for unknown event', async () => {
    const res = await get('/api/events/no-such-event/leaderboard');
    expect(res.status).toBe(404);
  });

  it('returns empty tracks for event with no stages', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    const res = await get('/api/events/test-event/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.tracks).toEqual([]);
  });

  it('returns empty tracks for event with stages but no results', async () => {
    const { token } = await createUser('owner', 'HOST');
    await createAndPublishEvent(token);
    await createSeededStage(token);
    const res = await get('/api/events/test-event/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.tracks).toEqual([]);
  });

  it('aggregates scores across a single SEEDED_LEADERBOARD stage (sum method)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    const stage = await createSeededStage(ownerToken);
    const game = await createGame(ownerToken, stage.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    const team = await createAndConfirmTeam(aliceToken, bobToken, bobId, stage.id);
    await submitResult(aliceToken, stage.id, game.id, team.id, 22);

    const res = await get('/api/events/test-event/leaderboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.tracks)).toBe(true);
    const track = res.body.tracks[0];
    expect(track.entries).toHaveLength(1); // one team
    expect(track.entries[0].rank).toBe(1);
    expect(track.entries[0].total_score).toBe(22);
  });

  it('ranks teams by total score across multiple stages', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createAndPublishEvent(ownerToken);
    // Use team_scope: EVENT so the same team ID is used across both stages
    const stage1 = await createSeededStage(ownerToken, 'test-event', { team_scope: 'EVENT' });
    const stage2 = await createSeededStage(ownerToken, 'test-event', { team_scope: 'EVENT' });
    const game1 = await createGame(ownerToken, stage1.id, 1);
    const game2 = await createGame(ownerToken, stage2.id, 1);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: carolToken } = await createUser('carol');
    const { token: daveToken, userId: daveId } = await createUser('dave');
    await register(aliceToken);
    await register(bobToken);
    await register(carolToken);
    await register(daveToken);

    // Event-scoped teams are shared across both stages
    const t1Res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });
    await post(`/api/events/test-event/teams/${t1Res.body.id}/confirm`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );
    const team1 = t1Res.body as { id: number };

    const t2Res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${carolToken}`)
      .send({ invite_user_ids: [daveId] });
    await post(`/api/events/test-event/teams/${t2Res.body.id}/confirm`).set(
      'Authorization',
      `Bearer ${daveToken}`,
    );
    const team2 = t2Res.body as { id: number };

    await submitResult(aliceToken, stage1.id, game1.id, team1.id, 20);
    await submitResult(carolToken, stage1.id, game1.id, team2.id, 15);
    await submitResult(aliceToken, stage2.id, game2.id, team1.id, 25);
    await submitResult(carolToken, stage2.id, game2.id, team2.id, 22);

    const res = await get('/api/events/test-event/leaderboard');
    expect(res.status).toBe(200);

    // alice+bob team: 20 + 25 = 45; carol+dave team: 15 + 22 = 37
    const track = res.body.tracks[0];
    const aliceTeamEntry = track.entries.find(
      (e: { team: { members: { display_name: string }[] } }) =>
        e.team.members.some((m) => m.display_name === 'alice'),
    );
    const carolTeamEntry = track.entries.find(
      (e: { team: { members: { display_name: string }[] } }) =>
        e.team.members.some((m) => m.display_name === 'carol'),
    );
    expect(aliceTeamEntry.total_score).toBe(45);
    expect(aliceTeamEntry.rank).toBe(1);
    expect(carolTeamEntry.total_score).toBe(37);
    expect(carolTeamEntry.rank).toBeGreaterThan(1);
    expect(aliceTeamEntry.stage_scores).toHaveLength(2);
  });
});
