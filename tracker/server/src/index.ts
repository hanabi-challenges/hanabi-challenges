import './env.js'; // validate env first — crashes fast if misconfigured
import { env } from './env.js';
import { createApp } from './app.js';
import { closePool } from './db/pool.js';

const app = createApp();

const server = app.listen(env.TRACKER_PORT, () => {
  console.log(`[tracker] server listening on port ${env.TRACKER_PORT}`);
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
