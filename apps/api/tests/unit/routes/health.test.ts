import { describe, expect, it } from 'vitest';
import { api } from '../../support/supertest';

describe('GET /health', () => {
  it('returns status payload', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        db: 'connected',
      }),
    );
  });
});
