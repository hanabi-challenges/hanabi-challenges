import pino from 'pino';

/**
 * Shared pino logger for the tracker service.
 * All log output includes service: "tracker" for filtering.
 * No user-facing data (display names, usernames) should appear in log messages — use UUIDs only.
 */
export const logger = pino({
  name: 'tracker',
  level: process.env['TRACKER_LOG_LEVEL'] ?? 'info',
  base: { service: 'tracker' },
});
