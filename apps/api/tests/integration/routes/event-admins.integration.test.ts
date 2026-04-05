import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, patch, del } from '../../support/api';

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

async function createEvent(token: string, slug = 'test-event') {
  const res = await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test event.',
      allowed_team_sizes: [2],
    });
  return res.body as { id: number; slug: string };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/admins
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/admins', () => {
  it('returns admins for an event owner', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await get('/api/events/test-event/admins').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].role).toBe('OWNER');
    expect(res.body[0].display_name).toBe('owner');
  });

  it('returns 403 for a non-admin user', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('other', 'USER');

    const res = await get('/api/events/test-event/admins').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(403);
  });

  it('returns 401 without auth', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await get('/api/events/test-event/admins');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/admins
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/admins', () => {
  it('adds an admin (owner only)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: newAdminId } = await createUser('newadmin', 'USER');

    const res = await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: newAdminId });

    expect(res.status).toBe(201);
    expect(res.body.user_id).toBe(newAdminId);
    expect(res.body.role).toBe('ADMIN');
  });

  it('returns 403 when called by a non-owner admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: adminId, token: adminToken } = await createUser('coadmin', 'USER');

    // Promote coadmin to ADMIN role on the event
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: adminId });

    const { userId: thirdId } = await createUser('third', 'USER');
    const res = await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: thirdId });

    expect(res.status).toBe(403);
  });

  it('returns 400 when user_id is missing', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('returns 404 when target user does not exist', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: 9999 });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/admins/:userId/role
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:slug/admins/:userId/role', () => {
  it('transfers ownership atomically — new owner is OWNER, old owner becomes ADMIN', async () => {
    const { token: ownerToken, userId: ownerId } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: newOwnerId } = await createUser('newowner', 'USER');

    // Add newowner as admin first
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: newOwnerId });

    const res = await patch(`/api/events/test-event/admins/${newOwnerId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'OWNER' });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('OWNER');
    expect(res.body.user_id).toBe(newOwnerId);

    // Verify old owner is now ADMIN
    const admins = await get('/api/events/test-event/admins').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    const oldOwnerRow = admins.body.find((a: { user_id: number }) => a.user_id === ownerId);
    expect(oldOwnerRow?.role).toBe('ADMIN');
  });

  it('returns 400 for an invalid role value', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: adminId } = await createUser('coadmin', 'USER');
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: adminId });

    const res = await patch(`/api/events/test-event/admins/${adminId}/role`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'SUPERADMIN' });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/admins/:userId
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/admins/:userId', () => {
  it('removes an admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { userId: adminId } = await createUser('coadmin', 'USER');
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: adminId });

    const res = await del(`/api/events/test-event/admins/${adminId}`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(204);

    const admins = await get('/api/events/test-event/admins').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );
    expect(admins.body.find((a: { user_id: number }) => a.user_id === adminId)).toBeUndefined();
  });

  it('prevents OWNER from removing themselves', async () => {
    const { token: ownerToken, userId: ownerId } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await del(`/api/events/test-event/admins/${ownerId}`).set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(400);
  });

  it('returns 403 for a non-owner', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: adminToken, userId: adminId } = await createUser('coadmin', 'USER');
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: adminId });

    // Co-admin tries to remove someone else
    const { userId: thirdId } = await createUser('third', 'USER');
    await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ user_id: thirdId });

    const res = await del(`/api/events/test-event/admins/${thirdId}`).set(
      'Authorization',
      `Bearer ${adminToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Superadmin bypass
// ---------------------------------------------------------------------------

describe('superadmin bypass', () => {
  it('superadmin can list admins without being an event admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: saToken } = await createUser('superadmin', 'SUPERADMIN');

    const res = await get('/api/events/test-event/admins').set(
      'Authorization',
      `Bearer ${saToken}`,
    );

    expect(res.status).toBe(200);
  });

  it('superadmin can add an admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: saToken } = await createUser('superadmin', 'SUPERADMIN');
    const { userId: newId } = await createUser('newguy', 'USER');

    const res = await post('/api/events/test-event/admins')
      .set('Authorization', `Bearer ${saToken}`)
      .send({ user_id: newId });

    expect(res.status).toBe(201);
  });
});
