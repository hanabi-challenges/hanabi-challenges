/**
 * Runs all pending tracker migrations.
 * Creates the tracker schema if it doesn't exist yet (bootstrapping).
 */
import { env } from '../env.js';
import postgres from 'postgres';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../migrations');

// Create the tracker schema if it doesn't already exist
const sql = postgres(env.TRACKER_DATABASE_URL, { max: 1 });
try {
  await sql`CREATE SCHEMA IF NOT EXISTS tracker`;
} finally {
  await sql.end();
}

// Run node-pg-migrate (uses DATABASE_URL env var)
execSync(
  [
    'node-pg-migrate up',
    `--migrations-dir "${migrationsDir}"`,
    '--migration-file-language sql',
    '--schema tracker',
    '--migrations-schema tracker',
    '--migrations-table tracker_schema_migrations',
  ].join(' '),
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: env.TRACKER_DATABASE_URL },
  },
);
