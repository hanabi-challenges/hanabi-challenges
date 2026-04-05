import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { Sql } from 'postgres';
import type { TrackerUserRow } from '../../../src/db/users.js';
import type { RoleSlug, TrackerUser } from '@tracker/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockSql = {} as Sql;

vi.mock('../../../src/db/pool.js', () => ({
  getPool: vi.fn(() => mockSql),
}));

const mockFindTrackerUser = vi.fn<() => Promise<TrackerUserRow | null>>();
const mockResolveUserRole = vi.fn<() => Promise<RoleSlug>>();

vi.mock('../../../src/db/users.js', () => ({
  findTrackerUser: mockFindTrackerUser,
  resolveUserRole: mockResolveUserRole,
}));

// ── Import after mocks ────────────────────────────────────────────────────────

const { requireTrackerAuth, requirePermission } = await import('../../../src/middleware/auth.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(user?: { hanabLiveUsername?: string; displayName?: string }): Request {
  return { user } as unknown as Request;
}

interface MockRes {
  _status: number;
  _body: unknown;
  status: (code: number) => this;
  json: (body: unknown) => this;
}

function makeRes(): MockRes & Response {
  const res: MockRes = {
    _status: 0,
    _body: undefined,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res as unknown as MockRes & Response;
}

interface MockNext extends NextFunction {
  error: unknown;
  called: boolean;
}

function makeNext(): MockNext {
  const fn = vi.fn((err?: unknown) => {
    fn.error = err;
    fn.called = true;
  }) as unknown as MockNext;
  fn.error = undefined;
  fn.called = false;
  return fn;
}

function errorCode(res: MockRes & Response): string {
  return (res._body as { error: { code: string } }).error.code;
}

// ── requireTrackerAuth ────────────────────────────────────────────────────────

describe('requireTrackerAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no req.user is set', async () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
    expect(next.called).toBe(false);
  });

  it('returns 401 when hanabLiveUsername is missing', async () => {
    const req = makeReq({});
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('returns 401 when user is not found in public.users', async () => {
    mockFindTrackerUser.mockResolvedValue(null);

    const req = makeReq({ hanabLiveUsername: 'unknown' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(res._status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
    expect(next.called).toBe(false);
  });

  it('returns 403 when account_status is banned', async () => {
    mockFindTrackerUser.mockResolvedValue({
      id: 1,
      display_name: 'Alice',
      account_status: 'banned',
    });

    const req = makeReq({ hanabLiveUsername: 'alice' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(res._status).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');
    expect(next.called).toBe(false);
  });

  it('returns 403 when account_status is restricted', async () => {
    mockFindTrackerUser.mockResolvedValue({
      id: 2,
      display_name: 'Bob',
      account_status: 'restricted',
    });

    const req = makeReq({ hanabLiveUsername: 'bob' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(res._status).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');
  });

  it('attaches trackerUser and calls next() for an active community_member', async () => {
    mockFindTrackerUser.mockResolvedValue({
      id: 3,
      display_name: 'Carol',
      account_status: 'active',
    });
    mockResolveUserRole.mockResolvedValue('community_member');

    const req = makeReq({ hanabLiveUsername: 'carol', displayName: 'Carol' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(next.error).toBeUndefined();
    const trackerUser = (req as unknown as Record<string, unknown>).trackerUser as TrackerUser;
    expect(trackerUser.id).toBe(3);
    expect(trackerUser.role).toBe('community_member');
    expect(trackerUser.account_status).toBe('active');
  });

  it('uses hanabLiveUsername as displayName fallback when displayName is absent', async () => {
    mockFindTrackerUser.mockResolvedValue({
      id: 4,
      display_name: 'dave',
      account_status: 'active',
    });
    mockResolveUserRole.mockResolvedValue('community_member');

    const req = makeReq({ hanabLiveUsername: 'dave' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(mockFindTrackerUser).toHaveBeenCalledWith(mockSql, 'dave');
  });

  it('calls next(err) when DB throws', async () => {
    const boom = new Error('db error');
    mockFindTrackerUser.mockRejectedValue(boom);

    const req = makeReq({ hanabLiveUsername: 'eve' });
    const res = makeRes();
    const next = makeNext();

    await requireTrackerAuth(req, res, next);

    expect(next.error).toBe(boom);
  });
});

// ── requirePermission ─────────────────────────────────────────────────────────

describe('requirePermission', () => {
  function reqWithRole(role?: RoleSlug): Request {
    const req = {} as unknown as Record<string, unknown>;
    if (role !== undefined) {
      req.trackerUser = {
        id: 1,
        hanablive_username: 'x',
        display_name: 'X',
        account_status: 'active',
        role,
      } satisfies TrackerUser;
    }
    return req as unknown as Request;
  }

  it('returns 401 when no trackerUser is attached', () => {
    const req = reqWithRole();
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.create')(req, res, next);

    expect(res._status).toBe(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('returns 403 when role lacks the permission', () => {
    const req = reqWithRole('community_member');
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.triage')(req, res, next);

    expect(res._status).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');
  });

  it('calls next() when community_member has ticket.create', () => {
    const req = reqWithRole('community_member');
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.create')(req, res, next);

    expect(next.error).toBeUndefined();
    expect(res._status).toBe(0);
  });

  it('calls next() when moderator has ticket.triage', () => {
    const req = reqWithRole('moderator');
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.triage')(req, res, next);

    expect(next.error).toBeUndefined();
  });

  it('calls next() when committee has ticket.decide', () => {
    const req = reqWithRole('committee');
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.decide')(req, res, next);

    expect(next.error).toBeUndefined();
  });

  it('returns 403 when moderator lacks ticket.decide', () => {
    const req = reqWithRole('moderator');
    const res = makeRes();
    const next = makeNext();

    requirePermission('ticket.decide')(req, res, next);

    expect(res._status).toBe(403);
  });
});
