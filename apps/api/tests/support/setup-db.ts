// Global setup for integration tests — applies schema.sql to bring the
// database to the canonical state before any test suite runs.
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { buildPgClientConfig } from '../../src/config/pg';
import { env } from '../../src/config/env';

export async function setup() {
  const schemaPath = path.resolve(__dirname, '../../db/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  const pool = new Pool(buildPgClientConfig(env.DATABASE_URL));
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}
