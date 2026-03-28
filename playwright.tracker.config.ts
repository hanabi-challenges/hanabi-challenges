/**
 * Playwright configuration for tracker E2E tests.
 *
 * Runs a single combined server: the tracker Express API also serves the
 * built tracker client at /tracker/ (TRACKER_SERVE_CLIENT=1). This means
 * all relative /tracker/api/* calls from the SPA resolve to the same
 * origin — no proxy or port-splitting required.
 *
 * Auth is handled via the X-Tracker-Test-Username request header, which
 * is accepted by requireTrackerAuth when NODE_ENV !== 'production'.
 * Browser tests inject this header via page.setExtraHTTPHeaders().
 *
 * Required environment variables:
 *   TRACKER_DATABASE_URL — Postgres connection string (migrations already applied)
 *
 * Optional:
 *   TRACKER_E2E_PORT     — Port for the combined server (default: 4002)
 */
import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env['TRACKER_E2E_PORT'] ?? 4002);
const baseUrl = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'tests/e2e/tracker',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `NODE_ENV=test TRACKER_PORT=${port} TRACKER_SERVE_CLIENT=1 node tracker/server/dist/src/index.js`,
    url: `${baseUrl}/tracker/health`,
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      TRACKER_PORT: String(port),
      TRACKER_SERVE_CLIENT: '1',
    },
  },
});
