import fs from 'fs/promises';
import path from 'path';
import { Pool } from 'pg';
import { buildPgClientConfig } from '../config/pg';

function resolveSchemaPath(): string {
  const fromRepoRoot = path.resolve(process.cwd(), 'apps/api/db/schema.sql');
  const fromApiDir = path.resolve(process.cwd(), 'db/schema.sql');
  return process.cwd().endsWith(path.join('apps', 'api')) ? fromApiDir : fromRepoRoot;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_OVERRIDE || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (or DATABASE_URL_OVERRIDE)');
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
      return;
    }

    console.log('[db-bootstrap] No users table found. Applying apps/api/db/schema.sql...');
    await pool.query(schemaSql);
    console.log('[db-bootstrap] Schema initialization complete.');
  } finally {
    await pool.end();
  }
}

void main().catch((err) => {
  console.error('[db-bootstrap] Failed:', err);
  process.exit(1);
});
