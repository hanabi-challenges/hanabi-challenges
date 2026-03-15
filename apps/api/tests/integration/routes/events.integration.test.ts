import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '../../../src/config/db';
import { loginOrCreateUser } from '../../../src/modules/auth/auth.service';
import { get, post, put, patch, del } from '../../support/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createUser(displayName: string, role: 'ADMIN' | 'SUPERADMIN' | 'USER' = 'USER') {
  const { token } = await loginOrCreateUser(displayName, 'password');
  if (role !== 'USER') {
    await pool.query(`UPDATE users SET role = $1 WHERE display_name = $2`, [role, displayName]);
    const elevated = await loginOrCreateUser(displayName, 'password');
    return elevated.token;
  }
  return token;
}

const baseEvent = {
  slug: 'test-event-2026',
  name: 'Test Event 2026',
  long_description: 'A test event for integration testing.',
  allowed_team_sizes: [2],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  await pool.query('TRUNCATE events, users RESTART IDENTITY CASCADE');
});

// ---------------------------------------------------------------------------
// POST /api/events
// ---------------------------------------------------------------------------

describe('POST /api/events', () => {
  it('creates an event and returns 201 with inferred status', async () => {
    const adminToken = await createUser('admin', 'ADMIN');

    const res = await post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(baseEvent);

    expect(res.status).toBe(201);
    expect(res.body.slug).toBe(baseEvent.slug);
    expect(res.body.name).toBe(baseEvent.name);
    expect(res.body.published).toBe(false);
    expect(res.body.status).toBe('ANNOUNCED');
    expect(res.body.starts_at).toBeNull();
    expect(res.body.ends_at).toBeNull();
  });

  it('returns 401 without auth', async () => {
    const res = await post('/api/events').send(baseEvent);
    expect(res.status).toBe(401);
  });

  it('returns 403 for a non-admin user', async () => {
    const userToken = await createUser('regular', 'USER');
    const res = await post('/api/events')
      .set('Authorization', `Bearer ${userToken}`)
      .send(baseEvent);
    expect(res.status).toBe(403);
  });

  it('returns 400 when required fields are missing', async () => {
    const adminToken = await createUser('admin', 'ADMIN');

    const res = await post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'missing-name', long_description: 'x', allowed_team_sizes: [2] });

    expect(res.status).toBe(400);
  });

  it('returns 409 when slug or name already exists', async () => {
    const adminToken = await createUser('admin', 'ADMIN');

    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(baseEvent);

    expect(res.status).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
  it('returns only published events for public requests', async () => {
    const adminToken = await createUser('admin', 'ADMIN');

    // Create one published and one unpublished event
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    await post('/api/events')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseEvent, slug: 'published-event', name: 'Published Event' });

    // Publish only the second one
    await patch('/api/events/published-event/publish').set('Authorization', `Bearer ${adminToken}`);

    const res = await get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].slug).toBe('published-event');
  });

  it('returns an empty array when no events are published', async () => {
    const res = await get('/api/events');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/events/:slug
// ---------------------------------------------------------------------------

describe('GET /api/events/:slug', () => {
  it('returns a published event', async () => {
    const adminToken = await createUser('admin', 'ADMIN');

    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);
    await patch('/api/events/test-event-2026/publish').set('Authorization', `Bearer ${adminToken}`);

    const res = await get('/api/events/test-event-2026');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('test-event-2026');
  });

  it('returns 404 for an unpublished event when not authenticated', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await get('/api/events/test-event-2026');
    expect(res.status).toBe(404);
  });

  it('returns an unpublished event for an admin', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await get('/api/events/test-event-2026').set(
      'Authorization',
      `Bearer ${adminToken}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.published).toBe(false);
  });

  it('returns 404 for a non-existent event', async () => {
    const res = await get('/api/events/does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/events/:slug
// ---------------------------------------------------------------------------

describe('PUT /api/events/:slug', () => {
  it('updates event fields and returns the updated event', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await put('/api/events/test-event-2026')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Event Name', long_description: 'Updated description.' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Event Name');
    expect(res.body.long_description).toBe('Updated description.');
    expect(res.body.slug).toBe('test-event-2026'); // slug unchanged
  });

  it('returns 404 for a non-existent event', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    const res = await put('/api/events/no-such-event')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const res = await put('/api/events/test-event-2026').send({ name: 'x' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/events/:slug/publish
// ---------------------------------------------------------------------------

describe('PATCH /api/events/:slug/publish', () => {
  it('toggles published from false to true', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await patch('/api/events/test-event-2026/publish').set(
      'Authorization',
      `Bearer ${adminToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.published).toBe(true);
  });

  it('toggles published from true back to false', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);
    await patch('/api/events/test-event-2026/publish').set('Authorization', `Bearer ${adminToken}`);

    const res = await patch('/api/events/test-event-2026/publish').set(
      'Authorization',
      `Bearer ${adminToken}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.published).toBe(false);
  });

  it('returns 404 for a non-existent event', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    const res = await patch('/api/events/no-such-event/publish').set(
      'Authorization',
      `Bearer ${adminToken}`,
    );
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/events/:slug
// ---------------------------------------------------------------------------

describe('DELETE /api/events/:slug', () => {
  it('deletes an event and returns 204 (superadmin)', async () => {
    const superadminToken = await createUser('superadmin', 'SUPERADMIN');
    await post('/api/events').set('Authorization', `Bearer ${superadminToken}`).send(baseEvent);

    const res = await del('/api/events/test-event-2026').set(
      'Authorization',
      `Bearer ${superadminToken}`,
    );

    expect(res.status).toBe(204);

    const check = await get('/api/events/test-event-2026').set(
      'Authorization',
      `Bearer ${superadminToken}`,
    );
    expect(check.status).toBe(404);
  });

  it('returns 403 for an admin (not superadmin)', async () => {
    const adminToken = await createUser('admin', 'ADMIN');
    await post('/api/events').set('Authorization', `Bearer ${adminToken}`).send(baseEvent);

    const res = await del('/api/events/test-event-2026').set(
      'Authorization',
      `Bearer ${adminToken}`,
    );

    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent event', async () => {
    const superadminToken = await createUser('superadmin', 'SUPERADMIN');
    const res = await del('/api/events/no-such-event').set(
      'Authorization',
      `Bearer ${superadminToken}`,
    );
    expect(res.status).toBe(404);
  });
});
