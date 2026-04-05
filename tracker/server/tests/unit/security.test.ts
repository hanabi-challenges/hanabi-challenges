/**
 * Security route audit: confirms every protected tracker API endpoint returns 401
 * for unauthenticated requests.
 *
 * This test uses no database — the 401 is returned by requireTrackerAuth as soon
 * as it detects no authenticated session (missing req.user.hanabLiveUsername), before
 * any database call is made.
 *
 * Public routes (/tracker/health, /tracker/health/db) are intentionally excluded.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';

process.env['TRACKER_DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';

const { createApp } = await import('../../src/app.js');

const app = createApp();

// [method, path] tuples for every protected tracker API endpoint
const PROTECTED_ROUTES: [string, string][] = [
  // Tickets
  ['post', '/tracker/api/tickets'],
  // GET /tracker/api/tickets is public (optionalTrackerAuth) — no 401
  ['get', '/tracker/api/tickets/ready-for-review'],
  ['get', '/tracker/api/tickets/planning-signal'],
  ['get', '/tracker/api/tickets/search?q=test'],
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001'],
  ['patch', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/status'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/flag'],
  ['delete', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/flag'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/duplicate'],
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/history'],
  // Discussion (mounted under /tracker/api/tickets/:ticketId)
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/comments'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/comments'],
  // GET .../votes is public (optionalTrackerAuth) — no 401
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/votes'],
  // Me
  ['get', '/tracker/api/me/notifications'],
  ['patch', '/tracker/api/me/notifications/00000000-0000-0000-0000-000000000001/read'],
  // Users (role management — GET / added in TICKET-040)
  ['post', '/tracker/api/users/00000000-0000-0000-0000-000000000001/roles'],
  ['delete', '/tracker/api/users/00000000-0000-0000-0000-000000000001/roles/moderator'],
  // Lookups
  ['get', '/tracker/api/lookups'],
  // Admin (GitHub integration)
  ['get', '/tracker/api/admin/reconcile'],
  ['get', '/tracker/api/admin/github-failures'],
];

type SupertestAgent = Record<string, (path: string) => request.Test>;

describe('security: unauthenticated requests return 401', () => {
  for (const [method, path] of PROTECTED_ROUTES) {
    it(`${method.toUpperCase()} ${path}`, async () => {
      // No auth headers — simulates an unauthenticated browser or API call
      const agent = request(app) as unknown as SupertestAgent;
      const res = await agent[method]!(path).set('Content-Type', 'application/json');
      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe('UNAUTHORIZED');
    });
  }
});
