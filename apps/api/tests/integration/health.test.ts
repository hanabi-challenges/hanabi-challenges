// backend/tests/integration/health.test.ts
import request from 'supertest';
import { app } from '../../src/app';

describe('GET /health', () => {
  it('returns ok and reports DB connected', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        db: 'connected',
      }),
    );
  });
});
