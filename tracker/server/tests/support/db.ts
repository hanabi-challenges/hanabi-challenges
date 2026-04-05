/**
 * Test database helpers.
 *
 * Each integration test run uses a clean tracker schema.
 * TRACKER_TEST_DATABASE_URL must be set to a PostgreSQL database
 * the test user has permission to create/drop schemas in.
 */
import postgres from 'postgres';

export function getTestDatabaseUrl(): string {
  const url = process.env['TRACKER_TEST_DATABASE_URL'] ?? process.env['TRACKER_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'TRACKER_TEST_DATABASE_URL (or TRACKER_DATABASE_URL) must be set for integration tests',
    );
  }
  return url;
}

export async function setupTestSchema(sql: postgres.Sql): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS tracker CASCADE`;
  await sql`CREATE SCHEMA tracker`;
}

export async function teardownTestSchema(sql: postgres.Sql): Promise<void> {
  await sql`DROP SCHEMA IF EXISTS tracker CASCADE`;
}
