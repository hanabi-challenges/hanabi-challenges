import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, del, patch, put } from '../../support/api';

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

async function createStage(adminToken: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      label: 'MP Stage',
      mechanism: 'MATCH_PLAY',
      team_policy: 'SELF_FORMED',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/entries
// ---------------------------------------------------------------------------

describe('GET /entries', () => {
  it('returns empty list when no entries', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);
    const res = await get(`/api/events/test-event/stages/${stage.id}/entries`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/entries
// ---------------------------------------------------------------------------

describe('POST /entries', () => {
  it('manually adds a team to bracket', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);
    const team = await createTeam(token, 'test-event', stage.id, 'alice', 'bob');

    const res = await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team.id, seed: 1 });
    expect(res.status).toBe(201);
    expect(res.body.event_team_id).toBe(team.id);
    expect(res.body.seed).toBe(1);
  });

  it('rejects team from another event', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    const res = await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: 9999 });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate enrollment', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);
    const team = await createTeam(token, 'test-event', stage.id, 'alice2', 'bob2');

    await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team.id });

    const res2 = await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team.id });
    expect(res2.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/stages/:stageId/entries/:entryId
// ---------------------------------------------------------------------------

describe('DELETE /entries/:entryId', () => {
  it('removes an entry', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);
    const team = await createTeam(token, 'test-event', stage.id, 'alice3', 'bob3');

    const add = await post(`/api/events/test-event/stages/${stage.id}/entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ team_id: team.id });
    const entryId = add.body.id;

    const res = await del(`/api/events/test-event/stages/${stage.id}/entries/${entryId}`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(204);

    const list = await get(`/api/events/test-event/stages/${stage.id}/entries`);
    expect(list.body).toHaveLength(0);
  });

  it('returns 404 for unknown entry', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    const res = await del(`/api/events/test-event/stages/${stage.id}/entries/9999`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/draw
// ---------------------------------------------------------------------------

describe('POST /draw', () => {
  it('generates round-1 matches for 4 teams', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    // Add 4 teams
    for (let i = 1; i <= 4; i++) {
      const team = await createTeam(token, 'test-event', stage.id, `pA${i}`, `pB${i}`);
      await post(`/api/events/test-event/stages/${stage.id}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team_id: team.id, seed: i });
    }

    const res = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(201);
    expect(res.body.matches).toHaveLength(2); // 4 teams, 2 round-1 matches
    expect(res.body.byes).toHaveLength(0);
  });

  it('handles byes for 6 teams', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    for (let i = 1; i <= 6; i++) {
      const team = await createTeam(token, 'test-event', stage.id, `qA${i}`, `qB${i}`);
      await post(`/api/events/test-event/stages/${stage.id}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team_id: team.id, seed: i });
    }

    const res = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(201);
    expect(res.body.matches).toHaveLength(2); // seeds 3v6 and 4v5
    expect(res.body.byes).toHaveLength(2); // seeds 1 and 2 get byes
  });

  it('blocks second draw', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    for (let i = 1; i <= 4; i++) {
      const team = await createTeam(token, 'test-event', stage.id, `rA${i}`, `rB${i}`);
      await post(`/api/events/test-event/stages/${stage.id}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team_id: team.id, seed: i });
    }

    await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    const res2 = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res2.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/stages/:stageId/advance
// ---------------------------------------------------------------------------

describe('POST /advance', () => {
  it('advances to round 2 after round 1 complete (4 teams)', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    const teams: { id: number }[] = [];
    for (let i = 1; i <= 4; i++) {
      const team = await createTeam(token, 'test-event', stage.id, `sA${i}`, `sB${i}`);
      await post(`/api/events/test-event/stages/${stage.id}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team_id: team.id, seed: i });
      teams.push(team);
    }

    const drawRes = await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    const matches = drawRes.body.matches as { id: number; team1_id: number; team2_id: number }[];

    // Complete round 1 matches
    for (const m of matches) {
      await patch(`/api/events/test-event/stages/${stage.id}/matches/${m.id}/winner`)
        .set('Authorization', `Bearer ${token}`)
        .send({ winner_team_id: m.team1_id });
      await put(`/api/events/test-event/stages/${stage.id}/matches/${m.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'COMPLETE' });
    }

    const advRes = await post(`/api/events/test-event/stages/${stage.id}/bracket/advance`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(advRes.status).toBe(200);
    expect(advRes.body.matches).toHaveLength(1); // Final match
    expect(advRes.body.is_final).toBe(true);
  });

  it('returns 409 when round not complete', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await setupEvent(token);
    const stage = await createStage(token);

    for (let i = 1; i <= 4; i++) {
      const team = await createTeam(token, 'test-event', stage.id, `tA${i}`, `tB${i}`);
      await post(`/api/events/test-event/stages/${stage.id}/entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ team_id: team.id, seed: i });
    }

    await post(`/api/events/test-event/stages/${stage.id}/bracket/draw`).set(
      'Authorization',
      `Bearer ${token}`,
    );

    // Don't complete any matches
    const res = await post(`/api/events/test-event/stages/${stage.id}/bracket/advance`).set(
      'Authorization',
      `Bearer ${token}`,
    );
    expect(res.status).toBe(409);
  });
});
