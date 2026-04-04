import './env.js'; // validate env first — crashes fast if misconfigured
import { env } from './env.js';
import { createApp } from './app.js';
import { closePool } from './db/pool.js';
import { logger } from './logger.js';
import postgres from 'postgres';
import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '../migrations');
const dbUrl = env.TRACKER_DATABASE_URL;

// Bootstrap: create tracker schema + apply pending migrations
const bootstrapSql = postgres(dbUrl, {
  max: 1,
  ssl: env.TRACKER_DATABASE_SSL ? 'require' : false,
});
try {
  await bootstrapSql`CREATE SCHEMA IF NOT EXISTS tracker`;
} finally {
  await bootstrapSql.end();
}

await runner({
  databaseUrl: dbUrl,
  migrationsTable: 'tracker_schema_migrations',
  schema: 'tracker',
  migrationsSchema: 'tracker',
  dir: migrationsDir,
  direction: 'up',
  log: (msg: string) => logger.info(msg),
});

logger.info('Tracker migrations complete');

const app = createApp();

const server = app.listen(env.TRACKER_PORT, () => {
  logger.info({ port: env.TRACKER_PORT }, 'tracker server listening');
});

function shutdown() {
  server.close(() => {
    void closePool().then(() => {
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
