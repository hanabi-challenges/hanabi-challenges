/**
 * Drops and recreates the tracker schema, then re-runs all migrations.
 * DEVELOPMENT ONLY — aborts in production.
 */
import { env } from '../env.js';
import postgres from 'postgres';
import { execSync } from 'child_process';

if (process.env['NODE_ENV'] === 'production') {
  console.error('[tracker] db:reset is not allowed in production.');
  process.exit(1);
}

const sql = postgres(env.TRACKER_DATABASE_URL, { max: 1 });

try {
  console.log('[tracker] Dropping tracker schema...');
  await sql`DROP SCHEMA IF EXISTS tracker CASCADE`;
  await sql`CREATE SCHEMA tracker`;
  console.log('[tracker] Schema recreated.');
} finally {
  await sql.end();
}

console.log('[tracker] Running migrations...');
execSync('pnpm run db:migrate', {
  stdio: 'inherit',
  env: { ...process.env },
});

console.log('[tracker] Reset complete.');
