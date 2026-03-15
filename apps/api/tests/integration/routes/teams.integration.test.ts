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
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: [2, 3],
    });
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
}

async function register(token: string, slug = 'test-event') {
  await post(`/api/events/${slug}/register`).set('Authorization', `Bearer ${token}`);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/teams
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/teams', () => {
  it('creates a team — initiator confirmed, invitee pending', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken, userId: aliceId } = await createUser('alice');
    const { userId: bobId } = await createUser('bob');

    await register(aliceToken);
    // Bob registers separately
    const { token: bobToken } = await loginOrCreateUser('bob', 'password');
    await register(bobToken);

    const res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    expect(res.status).toBe(201);
    expect(res.body.team_size).toBe(2);
    expect(res.body.members).toHaveLength(2);

    const alice = res.body.members.find((m: { user_id: number }) => m.user_id === aliceId);
    const bob = res.body.members.find((m: { user_id: number }) => m.user_id === bobId);
    expect(alice?.confirmed).toBe(true);
    expect(bob?.confirmed).toBe(false);
    expect(res.body.all_confirmed).toBe(false);
  });

  it('returns 400 when team size is not in allowed_team_sizes', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    await register(aliceToken);

    // Solo team — but allowed_team_sizes = [2, 3], not 1
    const res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [] });

    expect(res.status).toBe(400);
  });

  it('returns 409 when an invited user is not registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { userId: bobId } = await createUser('bob');
    await register(aliceToken);
    // Bob is NOT registered

    const res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    expect(res.status).toBe(409);
  });

  it('returns 409 when a member is already on a confirmed team', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken, userId: charlieId } = await createUser('charlie');

    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);

    // Alice creates team with Bob; Alice auto-confirms
    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });
    // Bob confirms
    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;
    await post(`/api/events/test-event/teams/${teamId}/confirm`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );

    // Alice tries to create another team with Charlie — Alice already on a confirmed team
    const res = await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [charlieId] });

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/teams/:teamId/confirm
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/teams/:teamId/confirm', () => {
  it('confirms an invited member', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    const res = await post(`/api/events/test-event/teams/${teamId}/confirm`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.all_confirmed).toBe(true);

    const bob = res.body.members.find((m: { user_id: number }) => m.user_id === bobId);
    expect(bob?.confirmed).toBe(true);
  });

  it('returns 404 when user is not invited to the team', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');

    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    const res = await post(`/api/events/test-event/teams/${teamId}/confirm`).set(
      'Authorization',
      `Bearer ${charlieToken}`,
    );

    expect(res.status).toBe(404);
  });

  it('returns 409 when already confirmed', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    // Alice is already confirmed (she created the team)
    const res = await post(`/api/events/test-event/teams/${teamId}/confirm`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/teams/:teamId/members/:userId
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/teams/:teamId/members/:userId', () => {
  it('member can remove themselves', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    // Bob declines the invite by removing themselves
    const res = await del(`/api/events/test-event/teams/${teamId}/members/${bobId}`).set(
      'Authorization',
      `Bearer ${bobToken}`,
    );

    expect(res.status).toBe(204);
  });

  it('event admin can remove a member', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    const teamId = listRes.body[0].id;

    const res = await del(`/api/events/test-event/teams/${teamId}/members/${bobId}`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(204);
  });

  it('returns 403 when non-admin tries to remove another user', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');

    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    const teamId = listRes.body[0].id;

    // Charlie (not on the team) tries to remove Bob
    const res = await del(`/api/events/test-event/teams/${teamId}/members/${bobId}`).set(
      'Authorization',
      `Bearer ${charlieToken}`,
    );

    expect(res.status).toBe(403);
  });

  it('returns 404 for non-member userId', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    const res = await del(`/api/events/test-event/teams/${teamId}/members/9999`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/teams
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/teams', () => {
  it('admin sees all teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const res = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('regular user sees only their own teams', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');
    const { token: charlieToken } = await createUser('charlie');
    const { token: daveToken, userId: daveId } = await createUser('dave');

    await register(aliceToken);
    await register(bobToken);
    await register(charlieToken);
    await register(daveToken);

    // Alice+Bob team
    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    // Charlie+Dave team
    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${charlieToken}`)
      .send({ invite_user_ids: [daveId] });

    const res = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(
      res.body[0].members.some((m: { display_name: string }) => m.display_name === 'alice'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/teams/:teamId
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/teams/:teamId', () => {
  it('returns team with derived display_name', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);
    const { token: aliceToken } = await createUser('alice');
    const { token: bobToken, userId: bobId } = await createUser('bob');

    await register(aliceToken);
    await register(bobToken);

    await post('/api/events/test-event/teams')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ invite_user_ids: [bobId] });

    const listRes = await get('/api/events/test-event/teams').set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );
    const teamId = listRes.body[0].id;

    const res = await get(`/api/events/test-event/teams/${teamId}`).set(
      'Authorization',
      `Bearer ${aliceToken}`,
    );

    expect(res.status).toBe(200);
    // alice < bob alphabetically → "Team alice"
    expect(res.body.display_name).toBe('Team alice');
    expect(res.body.members).toHaveLength(2);
  });

  it('returns 404 for unknown team', async () => {
    const { token: ownerToken } = await createUser('owner', 'ADMIN');
    await createAndPublishEvent(ownerToken);

    const res = await get('/api/events/test-event/teams/9999').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(404);
  });
});
