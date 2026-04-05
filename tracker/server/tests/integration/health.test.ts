import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import postgres from 'postgres';
import { getTestDatabaseUrl, setupTestSchema, teardownTestSchema } from '../support/db.js';

const testDbUrl = getTestDatabaseUrl();

// Set env before importing app modules
process.env['TRACKER_DATABASE_URL'] = testDbUrl;

const { createApp } = await import('../../src/app.js');
const { checkConnectionHealth } = await import('../../src/db/pool.js');

describe('GET /tracker/health/db (integration)', () => {
  let sql: postgres.Sql;
  const app = createApp();

  beforeAll(async () => {
    sql = postgres(testDbUrl, { max: 2 });
    await setupTestSchema(sql);
  });

  afterAll(async () => {
    await teardownTestSchema(sql);
    await sql.end();
  });

  it('returns 200 when database is reachable', async () => {
    const res = await request(app).get('/tracker/health/db');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('checkConnectionHealth (integration — unreachable DB)', () => {
  it('returns false for an unreachable database', async () => {
    const badSql = postgres('postgresql://nobody:nobody@127.0.0.1:1/nonexistent_db', {
      max: 1,
      connect_timeout: 2,
    });
    try {
      const healthy = await checkConnectionHealth(badSql);
      expect(healthy).toBe(false);
    } finally {
      await badSql.end({ timeout: 1 }).catch(() => undefined);
    }
  });
});
