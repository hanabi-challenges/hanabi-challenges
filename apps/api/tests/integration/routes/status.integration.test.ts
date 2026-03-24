import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch } from '../../support/api';

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

async function createSeededStage(token: string, slug = 'test-event') {
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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/status
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/status', () => {
  it('returns 404 for unknown event', async () => {
    const res = await get('/api/events/no-such-event/status');
    expect(res.status).toBe(404);
  });

  it('returns 404 for unpublished event to unauthenticated user', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'test-event',
        name: 'Test Event',
        long_description: 'Test.',
        allowed_team_sizes: [2],
      });
    const res = await get('/api/events/test-event/status');
    expect(res.status).toBe(404);
  });

  it('returns status for a published event', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await get('/api/events/test-event/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ANNOUNCED');
    expect(res.body).toHaveProperty('starts_at');
    expect(res.body).toHaveProperty('ends_at');
    expect(res.body).toHaveProperty('registration_opens_at');
    expect(res.body).toHaveProperty('registration_cutoff');
  });

  it('admin can see unpublished event status', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({
        slug: 'test-event',
        name: 'Test Event',
        long_description: 'Test.',
        allowed_team_sizes: [2],
      });
    const res = await get('/api/events/test-event/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ANNOUNCED');
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/status
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/stages/:stageId/status', () => {
  it('returns 404 for unknown stage', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const res = await get('/api/events/test-event/stages/999/status');
    expect(res.status).toBe(404);
  });

  it('returns status for a stage without dates (ANNOUNCED)', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const stage = await createSeededStage(token);
    const res = await get(`/api/events/test-event/stages/${stage.id}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ANNOUNCED');
    expect(res.body).toHaveProperty('starts_at');
    expect(res.body).toHaveProperty('ends_at');
  });

  it('returns COMPLETE for stage whose end date is in the past', async () => {
    const { token } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(token);
    const stage = await createSeededStage(token);

    // Set starts_at and ends_at in the past via PUT
    await post(`/api/events/test-event/stages`).set('Authorization', `Bearer ${token}`); // just to check the route exists

    // Update stage dates directly in DB to put it in COMPLETE state
    await pool.query(
      `UPDATE event_stages SET starts_at = NOW() - INTERVAL '2 days', ends_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [stage.id],
    );

    const res = await get(`/api/events/test-event/stages/${stage.id}/status`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETE');
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/stages/:stageId/leaderboard?team_size=N
// ---------------------------------------------------------------------------

describe('GET /stages/:stageId/leaderboard?team_size=N', () => {
  it('filters entries by team_size', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    // Create event allowing sizes 2 and 3
    await post('/api/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        slug: 'test-event',
        name: 'Test Event',
        long_description: 'Test.',
        allowed_team_sizes: [2, 3],
      });
    await patch('/api/events/test-event/publish').set('Authorization', `Bearer ${ownerToken}`);

    const stage = await createSeededStage(ownerToken);
    const gameRes = await post(`/api/events/test-event/stages/${stage.id}/games`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ game_index: 1, max_score: 25 });
    const gameId = gameRes.body.id;

    // Create 2-player team
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await post('/api/events/test-event/register').set('Authorization', `Bearer ${aliceToken}`);
    await post('/api/events/test-event/register').set('Authorization', `Bearer ${bobToken}`);
    const team2Res = await post(`/api/events/test-event/stages/${stage.id}/teams`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });
    await post(`/api/events/test-event/teams/${team2Res.body.id}/confirm`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );

    await post(`/api/events/test-event/stages/${stage.id}/games/${gameId}/results`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ team_id: team2Res.body.id, score: 20 });

    // With filter — only 2-player teams
    const res2 = await get(`/api/events/test-event/stages/${stage.id}/leaderboard?team_size=2`);
    expect(res2.status).toBe(200);
    expect(res2.body.entries).toHaveLength(1);
    expect(res2.body.entries[0].team_size).toBe(2);

    // With filter for 3-player teams — no results
    const res3 = await get(`/api/events/test-event/stages/${stage.id}/leaderboard?team_size=3`);
    expect(res3.status).toBe(200);
    expect(res3.body.entries).toHaveLength(0);

    // Without filter — all teams
    const resAll = await get(`/api/events/test-event/stages/${stage.id}/leaderboard`);
    expect(resAll.status).toBe(200);
    expect(resAll.body.entries).toHaveLength(1);
  });
});
