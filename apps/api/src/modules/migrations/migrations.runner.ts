import fs from 'fs';
import path from 'path';
import { pool } from '../../config/db';
import { info, warn } from '../../utils/logger';

// Resolve migrations dir relative to this file — works in both dev (src/) and prod (dist/src/)
// src/modules/migrations/ → ../../../db/migrations  → apps/api/db/migrations
// dist/src/modules/migrations/ → ../../../../db/migrations → apps/api/db/migrations
function findMigrationsDir(): string {
  for (const rel of ['../../../db/migrations', '../../../../db/migrations']) {
    const candidate = path.resolve(__dirname, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Could not locate migrations directory relative to ' + __dirname);
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(`SELECT name FROM schema_migrations`);
  return new Set(result.rows.map((r) => r.name));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  let migrationsDir: string;
  try {
    migrationsDir = findMigrationsDir();
  } catch (err) {
    warn((err as Error).message + ' — skipping migrations');
    return;
  }

  let files: string[];
  try {
    files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
  } catch {
    warn(`Migrations directory not found at ${migrationsDir} — skipping`);
    return;
  }

  for (const file of files) {
    if (applied.has(file)) continue;

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    info(`Running migration: ${file}`);
    const client = await pool.connect();
    try {
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
      info(`Migration applied: ${file}`);
    } catch (err) {
      warn(`Migration failed: ${file} — ${(err as Error).message}`);
      throw err;
    } finally {
      client.release();
    }
  }
}
