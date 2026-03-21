import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch } from '../../support/api';

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
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${adminToken}`);
}

async function createStage(adminToken: string, slug = 'test-event', config = {}) {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      label: 'MP Stage',
      mechanism: 'MATCH_PLAY',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
      config_json: config,
    });
  return res.body as { id: number };
}

async function createTeam(
  adminToken: string,
  slug: string,
  stageId: number,
  nameA: string,
  nameB: string,
) {
  const { token: tA } = await createUser(nameA);
  const { token: tB, userId: idB } = await createUser(nameB);
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${tA}`);
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${tB}`);
  const teamRes = await post(`/api/events/${slug}/stages/${stageId}/teams`)
    .set('Authorization', `Bearer ${tA}`)
    .send({ invite_user_ids: [idB] });
  await post(`/api/events/${slug}/teams/${teamRes.body.id}/confirm`).set(
    'Authorization',
    `Bearer ${tB}`,
  );
  return teamRes.body as { id: number };
}

async function setupBracketWithDraw(adminToken: string, gamesCount = 1) {
  const stage = await createStage(adminToken, 'test-event', {
    match_format: { games_count: gamesCount },
  });
  for (let i = 1; i <= 2; i++) {
    const team = await createTeam(
      adminToken,
      'test-event',
      stage.id,
      `p${gamesCount}A${i}`,
      `p${gamesCount}B${i}`,
    );
    await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ team_id: team.id, seed: i });
  }
  const drawRes = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
    'Authorization',
    `Bearer ${adminToken}`,
  );
  return { stage, draw: drawRes.body };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// T-040 — Game skeleton creation on bracket draw
// ---------------------------------------------------------------------------

describe('bracket draw creates game skeletons', () => {
  it('creates 1 game skeleton per match when games_count=1', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const { stage, draw } = await setupBracketWithDraw(token, 1);

    const matchId = draw.matches[0].id;
    const res = await get(`/api/events/test-event/stages/${stage.id}/matches/${matchId}`);
    expect(res.status).toBe(200);
    expect(res.body.game_results).toHaveLength(1);
    expect(res.body.game_results[0].game_index).toBe(1);
    expect(res.body.game_results[0].team1_score).toBeNull();
    expect(res.body.game_results[0].team2_score).toBeNull();
  });

  it('creates 3 game skeletons per match when games_count=3', async () => {
    const { token } = await createUser('owner2', 'ADMIN');
    await setupEvent(token);
    const { stage, draw } = await setupBracketWithDraw(token, 3);

    const matchId = draw.matches[0].id;
    const res = await get(`/api/events/test-event/stages/${stage.id}/matches/${matchId}`);
    expect(res.status).toBe(200);
    expect(res.body.game_results).toHaveLength(3);
    expect(res.body.game_results.map((g: { game_index: number }) => g.game_index)).toEqual([
      1, 2, 3,
    ]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /matches/:matchId/games/:gameIndex
// ---------------------------------------------------------------------------

describe('PATCH /matches/:matchId/games/:gameIndex', () => {
  it('admin can set variant_id and seed_payload on a skeleton', async () => {
    const { token } = await createUser('owner3', 'ADMIN');
    await setupEvent(token);
    const { stage, draw } = await setupBracketWithDraw(token, 1);

    const matchId = draw.matches[0].id;
    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/games/1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ variant_id: null, seed_payload: 'custom-seed-42' });
    expect(res.status).toBe(200);
    expect(res.body.game_index).toBe(1);
    expect(res.body.seed_payload).toBe('custom-seed-42');
  });

  it('returns 404 for unknown match', async () => {
    const { token } = await createUser('owner4', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/9999/games/1`)
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'x' });
    expect(res.status).toBe(404);
  });

  it('non-admin gets 403', async () => {
    const { token: adminToken } = await createUser('owner5', 'ADMIN');
    await setupEvent(adminToken);
    const { stage, draw } = await setupBracketWithDraw(adminToken, 1);
    const { token: userToken } = await createUser('regular5');

    const matchId = draw.matches[0].id;
    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/games/1`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ seed_payload: 'x' });
    expect(res.status).toBe(403);
  });

  it('upserts skeleton when game_index has no row yet', async () => {
    const { token } = await createUser('owner6', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token, 'test-event', { match_format: { games_count: 1 } });
    const team = await createTeam(token, 'test-event', stage.id, 'u6a', 'u6b');
    const team2 = await createTeam(token, 'test-event', stage.id, 'u6c', 'u6d');
    await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team.id, seed: 1 });
    await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team2.id, seed: 2 });
    const drawRes = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    const matchId = drawRes.body.matches[0].id;

    // Set game_index=2 (beyond games_count) — should upsert
    const res = await patch(`/api/events/test-event/stages/${stage.id}/matches/${matchId}/games/2`)
      .set('Authorization', `Bearer ${token}`)
      .send({ seed_payload: 'extra-game' });
    expect(res.status).toBe(200);
    expect(res.body.game_index).toBe(2);
    expect(res.body.seed_payload).toBe('extra-game');
  });
});
