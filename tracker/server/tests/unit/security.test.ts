/**
 * Security route audit: confirms every protected tracker API endpoint returns 401
 * for unauthenticated requests.
 *
 * This test uses no database — the 401 is returned by requireTrackerAuth as soon
 * as it detects no authenticated session (missing req.user.hanabLiveUsername), before
 * any database call is made.
 *
 * Public routes (/tracker/health, /tracker/health/db) are intentionally excluded.
 * Auth-aware public routes (optionalTrackerAuth) are also excluded:
 *   GET /tracker/api/tickets         — publicly readable, pins sort first when authed
 *   GET /tracker/api/tickets/:id/votes        — public; auth-aware for user_has_voted
 *   GET /tracker/api/tickets/:id/pins         — public; auth-aware for is_pinned
 *   GET /tracker/api/tickets/:id/subscriptions — public; auth-aware for is_subscribed
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
  // GET /tracker/api/tickets uses optionalTrackerAuth — publicly readable
  ['get', '/tracker/api/tickets/ready-for-review'],
  ['get', '/tracker/api/tickets/planning-signal'],
  ['get', '/tracker/api/tickets/search?q=test'],
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001'],
  ['patch', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/status'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/flag'],
  ['delete', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/flag'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/duplicate'],
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/history'],
  ['patch', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/metadata'],
  ['delete', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001'],
  // Discussion (mounted under /tracker/api/tickets/:ticketId)
  ['get', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/comments'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/comments'],
  // GET /tracker/api/tickets/:id/votes uses optionalTrackerAuth — publicly readable
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/votes'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/pins'],
  ['delete', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/pins'],
  ['post', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/subscriptions'],
  ['delete', '/tracker/api/tickets/00000000-0000-0000-0000-000000000001/subscriptions'],
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
