import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';

// Set required env vars before importing the service
process.env.TRACKER_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const { validateGithubSignature } = await import('../../src/services/github.js');

const SECRET = 'test-secret-value';

function makeSignature(body: Buffer, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

describe('validateGithubSignature', () => {
  it('returns true for a valid signature', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const sig = makeSignature(body, SECRET);
    expect(validateGithubSignature(body, sig, SECRET)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const sig = makeSignature(body, SECRET);
    const tamperedBody = Buffer.from(JSON.stringify({ action: 'closed' }));
    expect(validateGithubSignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it('returns false for a wrong secret', () => {
    const body = Buffer.from(JSON.stringify({ action: 'opened' }));
    const sig = makeSignature(body, 'wrong-secret');
    expect(validateGithubSignature(body, sig, SECRET)).toBe(false);
  });

  it('returns false when signature header is missing', () => {
    const body = Buffer.from('{}');
    expect(validateGithubSignature(body, undefined, SECRET)).toBe(false);
  });

  it('returns false when signature lacks sha256= prefix', () => {
    const body = Buffer.from('{}');
    const raw = createHmac('sha256', SECRET).update(body).digest('hex');
    expect(validateGithubSignature(body, raw, SECRET)).toBe(false);
  });

  it('returns false for an empty body when signature was computed on non-empty body', () => {
    const realBody = Buffer.from('{"action":"opened"}');
    const sig = makeSignature(realBody, SECRET);
    expect(validateGithubSignature(Buffer.from(''), sig, SECRET)).toBe(false);
  });
});
