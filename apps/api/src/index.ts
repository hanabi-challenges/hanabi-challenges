import { app } from './app';
import { env } from './config/env';
import { info, warn } from './utils/logger';
import { spawn } from 'child_process';
import { join } from 'path';
import { runMigrations } from './modules/migrations/migrations.runner';
import { startVariantSyncScheduler } from './modules/variants/variants.service';
import { startReplayPullWorker } from './workers/replay-pull.worker';
import { ensureNotificationsSchema } from './modules/notifications/notifications.service';
import {
  initNotificationsWebSocketServer,
  startNotificationDbListener,
} from './modules/notifications/notifications.ws';
import { ensureAdminAccessSchema } from './modules/admin-access/admin-access.service';
import { ensureChallengeBadgeConfigSchema } from './modules/events/events.service';

function spawnTracker() {
  const trackerEntry = join(process.cwd(), 'tracker/server/dist/src/index.js');
  const child = spawn(process.execPath, [trackerEntry], {
    env: { ...process.env },
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      warn(`Tracker exited with code ${code} — restarting in 3s`);
      setTimeout(spawnTracker, 3000);
    }
  });
  child.on('error', (err: Error) => {
    warn('Failed to spawn tracker:', err.message);
  });
}

runMigrations()
  .then(() => {
    const server = app.listen(env.BACKEND_PORT, () => {
      info(`Backend running at http://localhost:${env.BACKEND_PORT}`);
      spawnTracker();
    });

    initNotificationsWebSocketServer(server);

    startVariantSyncScheduler();
    startReplayPullWorker();
    return Promise.all([
      ensureNotificationsSchema(),
      ensureAdminAccessSchema(),
      ensureChallengeBadgeConfigSchema(),
    ]);
  })
  .then(() => startNotificationDbListener())
  .catch((err: unknown) => {
    warn('Startup sequence failed — process will exit:', err);
    process.exit(1);
  });
