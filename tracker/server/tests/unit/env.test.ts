import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Re-export the internal schema for testing without importing the module-level
// singleton (which runs at import time and reads process.env).
const envSchema = z.object({
  TRACKER_DATABASE_URL: z.string().url('TRACKER_DATABASE_URL must be a valid URL'),
  TRACKER_DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  TRACKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  TRACKER_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TRACKER_DATABASE_SSL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  DISCORD_MOD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_MOD_ROLE_NAME: z.string().optional(),
  GITHUB_BOT_TOKEN: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_REPO_OWNER: z.string().optional(),
  GITHUB_REPO_NAME: z.string().optional(),
  STALE_TICKET_DAYS: z.coerce.number().int().positive().default(14),
  COMMENT_EDIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const MINIMAL_VALID: Record<string, string> = {
  TRACKER_DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
};

describe('tracker env schema', () => {
  it('accepts a minimal valid config', () => {
    const result = envSchema.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const result = envSchema.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TRACKER_PORT).toBe(4001);
    expect(result.data.TRACKER_DATABASE_POOL_SIZE).toBe(10);
    expect(result.data.STALE_TICKET_DAYS).toBe(14);
    expect(result.data.COMMENT_EDIT_WINDOW_MINUTES).toBe(15);
    expect(result.data.NODE_ENV).toBe('development');
  });

  it('rejects a config with missing TRACKER_DATABASE_URL', () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('TRACKER_DATABASE_URL');
  });

  it('rejects an invalid TRACKER_DATABASE_URL', () => {
    const result = envSchema.safeParse({ ...MINIMAL_VALID, TRACKER_DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts a complete config with optional variables set', () => {
    const full: Record<string, string> = {
      ...MINIMAL_VALID,
      TRACKER_DATABASE_POOL_SIZE: '20',
      TRACKER_PORT: '4002',
      TRACKER_LOG_LEVEL: 'debug',
      TRACKER_DATABASE_SSL: 'true',
      DISCORD_MOD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/abc',
      DISCORD_BOT_TOKEN: 'some-token',
      DISCORD_GUILD_ID: '123456789',
      DISCORD_MOD_ROLE_NAME: 'mod',
      GITHUB_BOT_TOKEN: 'ghp_token',
      GITHUB_WEBHOOK_SECRET: 'secret',
      GITHUB_REPO_OWNER: 'myorg',
      GITHUB_REPO_NAME: 'myrepo',
      STALE_TICKET_DAYS: '7',
      COMMENT_EDIT_WINDOW_MINUTES: '30',
      NODE_ENV: 'production',
    };
    const result = envSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.TRACKER_DATABASE_POOL_SIZE).toBe(20);
    expect(result.data.TRACKER_DATABASE_SSL).toBe(true);
    expect(result.data.STALE_TICKET_DAYS).toBe(7);
  });

  it('accepts a config with all optional variables absent', () => {
    const result = envSchema.safeParse(MINIMAL_VALID);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.DISCORD_BOT_TOKEN).toBeUndefined();
    expect(result.data.GITHUB_BOT_TOKEN).toBeUndefined();
  });
});
