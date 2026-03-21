import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { post, patch } from '../../support/api';

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
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: [2],
    });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function createQueuedStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Queue Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'INDIVIDUAL',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function createSelfFormedStage(token: string, slug = 'test-event') {
  const res = await post(`/api/events/${slug}/stages`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      label: 'Self Formed Stage',
      mechanism: 'SEEDED_LEADERBOARD',
      participation_type: 'TEAM',
      team_scope: 'STAGE',
      attempt_policy: 'SINGLE',
      time_policy: 'WINDOW',
    });
  return res.body as { id: number };
}

async function register(token: string, slug = 'test-event') {
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

async function optIn(token: string, stageId: number, partnerUserId?: number) {
  return post(`/api/events/test-event/stages/${stageId}/opt-in`)
    .set('Authorization', `Bearer ${token}`)
    .send(partnerUserId !== undefined ? { partner_user_id: partnerUserId } : {});
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /draw (preview)
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/draw', () => {
  it('returns a draw proposal with proposed pairs', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(1);
    expect(res.body.teams[0].kind).toBe('PROPOSED_PAIR');
    expect(res.body.unmatched).toHaveLength(0);
  });

  it('shows confirmed pair when both sides opted in with each other', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id, bobId);
    await optIn(bobToken, stage.id, aliceId);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.teams[0].kind).toBe('CONFIRMED_PAIR');
  });

  it('does not persist teams (preview only)', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    await post(`/api/events/test-event/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    // Teams should not exist yet
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_teams WHERE stage_id = $1`,
      [stage.id],
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('returns 409 when teams already exist', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    // Confirm the draw first
    await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    // Preview should now fail
    const res = await post(`/api/events/test-event/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(409);
  });

  it('returns 403 for a regular user', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /draw/confirm
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/draw/confirm', () => {
  it('creates QUEUED teams from opt-ins', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].team_size).toBe(2);
    expect(res.body[0].members.every((m: { confirmed: boolean }) => m.confirmed)).toBe(true);
  });

  it('returns 409 when teams already exist', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(409);
  });

  it('returns 409 for non-QUEUED stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createSelfFormedStage(ownerToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// POST /draw/reset
// ---------------------------------------------------------------------------

describe('POST /stages/:stageId/draw/reset', () => {
  it('deletes QUEUED teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken } = await createUser('bob');
    await register(aliceToken);
    await register(bobToken);
    await optIn(aliceToken, stage.id);
    await optIn(bobToken, stage.id);

    await post(`/api/events/test-event/stages/${stage.id}/draw/confirm`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/reset`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.deleted_count).toBe(1);

    // Teams should be gone
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_teams WHERE stage_id = $1 AND source = 'QUEUED'`,
      [stage.id],
    );
    expect(parseInt(rows[0].count, 10)).toBe(0);
  });

  it('returns 0 when no QUEUED teams exist', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/reset`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.deleted_count).toBe(0);
  });

  it('does not delete REGISTERED-source teams for the same stage', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const stage = await createQueuedStage(ownerToken);

    // Manually insert a REGISTERED-source team for this stage
    await pool.query(
      `INSERT INTO event_teams (event_id, stage_id, team_size, source)
       VALUES (1, $1, 2, 'REGISTERED')`,
      [stage.id],
    );

    const res = await post(`/api/events/test-event/stages/${stage.id}/draw/reset`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.deleted_count).toBe(0);

    // REGISTERED team should still exist
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS count FROM event_teams WHERE stage_id = $1 AND source = 'REGISTERED'`,
      [stage.id],
    );
    expect(parseInt(rows[0].count, 10)).toBe(1);
  });
});
