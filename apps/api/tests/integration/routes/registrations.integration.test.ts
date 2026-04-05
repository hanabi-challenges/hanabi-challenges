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

async function createEvent(
  token: string,
  slug = 'test-event',
  extra: Record<string, unknown> = {},
) {
  const res = await post('/api/events')
    .set('Authorization', `Bearer ${token}`)
    .send({
      slug,
      name: `Event ${slug}`,
      long_description: 'Test.',
      allowed_team_sizes: [2],
      published: true,
      ...extra,
    });
  // Publish it so regular users can find it
  await patch(`/api/events/${slug}/publish`).set('Authorization', `Bearer ${token}`);
  return res.body as { id: number; slug: string };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/register
// ---------------------------------------------------------------------------

describe('POST /api/events/:slug/register', () => {
  it('registers a user and returns ACTIVE registration', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
    expect(res.body.display_name).toBe('alice');
  });

  it('re-registers a previously withdrawn user', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);
    await del('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('is idempotent for already-registered users', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);
    const res = await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 409 when cutoff has passed and late registration is disabled', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken, 'test-event', {
      registration_cutoff: '2020-01-01T00:00:00Z',
      allow_late_registration: false,
    });
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(409);
  });

  it('allows registration after cutoff when allow_late_registration is true', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken, 'test-event', {
      registration_cutoff: '2020-01-01T00:00:00Z',
      allow_late_registration: true,
    });
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await post('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(201);
  });

  it('returns 401 without auth', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await post('/api/events/test-event/register');
    expect(res.status).toBe(401);
  });

  it('returns 404 for unknown event', async () => {
    const { token } = await createUser('alice', 'USER');

    const res = await post('/api/events/no-such-event/register').set(
      'Authorization',
      `Bearer ${token}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug/register
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug/register', () => {
  it('withdraws a registration', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await del('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WITHDRAWN');
  });

  it('returns 404 when not registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await del('/api/events/test-event/register').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/registrations/me
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/registrations/me', () => {
  it('returns the current user registration', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await get('/api/events/test-event/registrations/me').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('returns 404 when not registered', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await get('/api/events/test-event/registrations/me').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug/registrations
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug/registrations', () => {
  it('returns all registrations (admin only)', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await get('/api/events/test-event/registrations').set(
      'Authorization',
      `Bearer ${ownerToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].display_name).toBe('alice');
  });

  it('returns 403 for non-admin user', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken } = await createUser('alice', 'USER');

    const res = await get('/api/events/test-event/registrations').set(
      'Authorization',
      `Bearer ${userToken}`,
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/registrations/:userId
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:slug/registrations/:userId', () => {
  it('admin can change registration status', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken, userId } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await patch(`/api/events/test-event/registrations/${userId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'WITHDRAWN' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('WITHDRAWN');
  });

  it('returns 400 for invalid status', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken, userId } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const res = await patch(`/api/events/test-event/registrations/${userId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'BANNED' });

    expect(res.status).toBe(400);
  });

  it('returns 404 for unregistered user', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);

    const res = await patch('/api/events/test-event/registrations/9999')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.status).toBe(404);
  });

  it('returns 403 for non-admin', async () => {
    const { token: ownerToken } = await createUser('owner', 'HOST');
    await createEvent(ownerToken);
    const { token: userToken, userId } = await createUser('alice', 'USER');

    await post('/api/events/test-event/register').set('Authorization', `Bearer ${userToken}`);

    const { token: otherToken } = await createUser('bob', 'USER');
    const res = await patch(`/api/events/test-event/registrations/${userId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'WITHDRAWN' });

    expect(res.status).toBe(403);
  });
});
