import { app } from './app';
import { env } from './config/env';
import { info } from './utils/logger';
import { runMigrations } from './modules/migrations/migrations.runner';
import { startVariantSyncScheduler } from './modules/variants/variants.service';
import { ensureNotificationsSchema } from './modules/notifications/notifications.service';
import {
  initNotificationsWebSocketServer,
  startNotificationDbListener,
} from './modules/notifications/notifications.ws';
import { ensureAdminAccessSchema } from './modules/admin-access/admin-access.service';
import { ensureChallengeBadgeConfigSchema } from './modules/events/event.service';

const server = app.listen(env.BACKEND_PORT, () => {
  info(`Backend running at http://localhost:${env.BACKEND_PORT}`);
  void runMigrations()
    .then(() => {
      startVariantSyncScheduler();
      return Promise.all([
        ensureNotificationsSchema(),
        ensureAdminAccessSchema(),
        ensureChallengeBadgeConfigSchema(),
      ]);
    })
    .then(() => startNotificationDbListener());
});

initNotificationsWebSocketServer(server);
