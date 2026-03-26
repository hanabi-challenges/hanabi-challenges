import { z } from 'zod';

const schema = z.object({
  TRACKER_DATABASE_URL: z.string().url('TRACKER_DATABASE_URL must be a valid URL'),
  TRACKER_DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  TRACKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  TRACKER_LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  TRACKER_DATABASE_SSL: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
  // Discord integrations — optional; activates on presence
  DISCORD_MOD_WEBHOOK_URL: z.string().url().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_MOD_ROLE_NAME: z.string().optional(),
});

function loadEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Tracker environment variable validation failed:\n${issues}`);
  }
  return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
