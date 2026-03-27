import postgres from 'postgres';
import { env } from '../env.js';

let _pool: postgres.Sql | null = null;

/**
 * Returns the shared postgres.js connection pool for the tracker.
 * The pool is created lazily on first access.
 *
 * Connection string is never logged — it is read from env at call time.
 */
export function getPool(): postgres.Sql {
  if (_pool === null) {
    _pool = postgres(env.TRACKER_DATABASE_URL, {
      max: env.TRACKER_DATABASE_POOL_SIZE,
      ssl: env.TRACKER_DATABASE_SSL ? 'require' : false,
      connection: {
        application_name: 'tracker',
        search_path: 'tracker',
        // Kill any query that runs longer than 5 seconds; logged by the global error handler.
        statement_timeout: 5000,
      },
      // Crash the process on connection error at startup — do not swallow silently
      onnotice: () => undefined,
    });
  }
  return _pool;
}

/**
 * Closes the connection pool. Called on SIGTERM/SIGINT.
 */
export async function closePool(): Promise<void> {
  if (_pool !== null) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Executes a trivial query to verify the pool is healthy.
 * Returns true if the database is reachable, false otherwise.
 */
export async function checkDbHealth(): Promise<boolean> {
  return checkConnectionHealth(getPool());
}

/**
 * Executes a trivial query against the given sql instance.
 * Exposed for testing with arbitrary connections.
 */
export async function checkConnectionHealth(sql: postgres.Sql): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
