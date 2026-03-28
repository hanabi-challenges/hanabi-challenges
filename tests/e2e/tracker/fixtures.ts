/**
 * Shared Playwright fixtures for tracker E2E tests.
 *
 * Provides:
 *   - trackerApi: APIRequestContext with auth header preset for a given user
 *   - authPage: Page with the X-Tracker-Test-Username header set
 *   - seed: function to reset ticket data and seed test users before each test
 */
import { test as base, type APIRequestContext, type Page } from '@playwright/test';

const baseUrl = process.env['TRACKER_E2E_URL'] ?? 'http://127.0.0.1:4002';

export interface TestUser {
  username: string;
  display_name?: string;
  role?: 'community_member' | 'moderator' | 'committee';
}

export interface SeededUser {
  username: string;
  id: string;
  role: string;
}

export interface SeedResult {
  seeded: SeededUser[];
  byUsername: Map<string, SeededUser>;
}

/** Resets ticket data and seeds users. Call this in beforeEach. */
export async function seedUsers(
  request: APIRequestContext,
  users: TestUser[],
): Promise<SeedResult> {
  const res = await request.post(`${baseUrl}/tracker/api/test/seed`, {
    data: { users },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`seed failed: ${res.status()} ${body}`);
  }
  const body = (await res.json()) as { seeded: SeededUser[] };
  const byUsername = new Map(body.seeded.map((u) => [u.username, u]));
  return { seeded: body.seeded, byUsername };
}

/** Returns an APIRequestContext with the given username set as test auth header. */
export function apiAs(
  request: APIRequestContext,
  username: string,
): { get: (path: string) => Promise<Response>; post: (path: string, body?: unknown) => Promise<Response>; patch: (path: string, body?: unknown) => Promise<Response>; delete: (path: string) => Promise<Response> } {
  const headers = { 'x-tracker-test-username': username };

  const doRequest = async (method: string, path: string, body?: unknown) => {
    const url = `${baseUrl}${path}`;
    const init: Parameters<APIRequestContext['fetch']>[1] = {
      method,
      headers: { ...headers, 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      init.data = body;
    }
    return request.fetch(url, init);
  };

  return {
    get: (path) => doRequest('GET', path),
    post: (path, body) => doRequest('POST', path, body),
    patch: (path, body) => doRequest('PATCH', path, body),
    delete: (path) => doRequest('DELETE', path),
  };
}

/** Navigates to a tracker page as the given user (sets auth header on page). */
export async function navigateAs(page: Page, username: string, path: string): Promise<void> {
  await page.setExtraHTTPHeaders({ 'x-tracker-test-username': username });
  await page.goto(`/tracker${path}`);
}

export { base };
