/**
 * Rolls back the most recent tracker migration.
 */
import { env } from '../env.js';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../../migrations');

execSync(
  [
    'node-pg-migrate down',
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
