import type { AuthenticatedRequest } from '../../middleware/authMiddleware';

export function getErrorDetail(err: unknown): string | null {
  const e = err as { detail?: string; message?: string; code?: string } | null | undefined;
  const detail = e?.detail?.trim();
  if (detail) return detail;
  const message = e?.message?.trim();
  if (message) return message;
  return null;
}

export function getErrorCode(err: unknown): string | null {
  const e = err as { code?: string } | null | undefined;
  return typeof e?.code === 'string' ? e.code : null;
}

export function isAdminUser(req: AuthenticatedRequest): boolean {
  const role = req.user?.role;
  return role === 'ADMIN' || role === 'SUPERADMIN';
}

export function validateLength(
  field: string,
  value: string | null | undefined,
  opts: { min?: number; max?: number },
) {
  if (value == null) return null;
  if (typeof value !== 'string') {
    return `${field} must be a string`;
  }
  const trimmed = value.trim();
  if (opts.min && trimmed.length < opts.min) {
    return `${field} must be at least ${opts.min} characters`;
  }
  if (opts.max && trimmed.length > opts.max) {
    return `${field} must be at most ${opts.max} characters`;
  }
  return null;
}
