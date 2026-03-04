import { describe, expect, it } from 'vitest';
import { get } from '../../support/api';

describe('health route (integration)', () => {
  it('returns connected status', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
  });
});
