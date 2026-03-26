import { describe, it, expect } from 'vitest';

describe('@tracker/types smoke test', () => {
  it('exports HealthResponse shape', async () => {
    const mod = await import('./index.js');
    // The module exports types only; confirm the module loads without error.
    expect(mod).toBeDefined();
  });
});
