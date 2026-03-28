import { spawn } from 'child_process';
import { join } from 'path';
import { app } from './app';
import { env } from './config/env';
import { info, warn } from './utils/logger';
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

runMigrations()
  .then(() => {
    const server = app.listen(env.BACKEND_PORT, () => {
      info(`Backend running at http://localhost:${env.BACKEND_PORT}`);
    });

    initNotificationsWebSocketServer(server);

    // Spawn the tracker server as a co-located subprocess in non-dev environments.
    // In development each server runs independently via `pnpm run dev`.
    if (process.env.NODE_ENV !== 'development') {
      const trackerPath = join(process.cwd(), 'tracker/server/dist/src/index.js');
      const tracker = spawn(process.execPath, [trackerPath], {
        env: process.env,
        stdio: 'inherit',
      });
      tracker.on('error', (err) => warn('tracker process error:', err));
      tracker.on('exit', (code) => warn(`tracker process exited with code ${code}`));
    }

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
