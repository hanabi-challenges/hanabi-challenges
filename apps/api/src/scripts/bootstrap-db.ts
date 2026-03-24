import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import { buildPgClientConfig } from '../config/pg';

function resolveSchemaPath(): string {
  const fromRepoRoot = path.resolve(process.cwd(), 'apps/api/db/schema.sql');
  const fromApiDir = path.resolve(process.cwd(), 'db/schema.sql');
  return process.cwd().endsWith(path.join('apps', 'api')) ? fromApiDir : fromRepoRoot;
}

async function backfillSchemaMigrations(pool: Pool, schemaPath: string): Promise<void> {
  const migrationsDir = path.join(path.dirname(schemaPath), 'migrations');
  let migrationFiles: string[];
  try {
    const entries = await fs.readdir(migrationsDir);
    migrationFiles = entries.filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.log('[db-bootstrap] Migrations directory not accessible; skipping backfill.');
    return;
  }
  if (migrationFiles.length === 0) return;

  const inserts = migrationFiles
    .map(
      (f) => `INSERT INTO schema_migrations (name) VALUES ('${f}') ON CONFLICT (name) DO NOTHING;`,
    )
    .join('\n  ');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ${inserts}
  `);
  console.log(
    `[db-bootstrap] Backfilled schema_migrations with ${migrationFiles.length} baseline entries.`,
  );
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  try {
    const { hostname } = new URL(connectionString);
    console.log(`[db-bootstrap] Connecting to host: ${hostname}`);
  } catch {
    console.log('[db-bootstrap] DATABASE_URL is not a valid URL');
  }

  const schemaPath = resolveSchemaPath();
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const pool = new Pool(buildPgClientConfig(connectionString));

  try {
    const check = await pool.query<{ users_table: string | null }>(
      "SELECT to_regclass('public.users') AS users_table",
    );
    const usersTable = check.rows[0]?.users_table ?? null;

    if (usersTable) {
      console.log('[db-bootstrap] Existing schema detected; skipping initialization.');
    } else {
      console.log('[db-bootstrap] No users table found. Applying apps/api/db/schema.sql...');
      await pool.query(schemaSql);
      console.log('[db-bootstrap] Schema initialization complete.');
    }

    // Always backfill schema_migrations so that databases initialized with older schema.sql
    // (which may not have seeded the full migration list) never re-apply already-reflected
    // migrations (e.g. migration 002 which drops tables without CASCADE).
    await backfillSchemaMigrations(pool, schemaPath);
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error('[db-bootstrap] Failed:', err);
  process.exit(1);
});
