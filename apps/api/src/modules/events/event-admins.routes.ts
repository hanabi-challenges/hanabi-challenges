import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from './events.service';
import {
  getEventAdminRole,
  listEventAdmins,
  addEventAdmin,
  changeEventAdminRole,
  removeEventAdmin,
  type EventAdminRole,
} from './event-admins.service';

// Mounted at /api/events/:slug/admins via events.routes.ts
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Permission helper
// Resolves the event from :slug, then checks caller's permission level.
// Returns { eventId, callerRole } or sends a 4xx and returns null.
// ---------------------------------------------------------------------------
async function resolveEventAndPermission(
  req: AuthenticatedRequest,
  res: Response,
  requiredLevel: 'VIEW' | 'OWNER',
): Promise<{ eventId: number; callerRole: EventAdminRole | 'SUPERADMIN' } | null> {
  const slug = String(req.params.slug);
  const isSuperadmin = req.user?.role === 'SUPERADMIN';
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  if (isSuperadmin) return { eventId: event.id, callerRole: 'SUPERADMIN' };

  const role = await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  if (requiredLevel === 'OWNER' && role !== 'OWNER') {
    res.status(403).json({ error: 'Only the event owner can perform this action' });
    return null;
  }

  return { eventId: event.id, callerRole: role };
}

// GET /api/events/:slug/admins — list admins (OWNER or ADMIN can view)
router.get('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndPermission(req, res, 'VIEW');
  if (!ctx) return;
  const admins = await listEventAdmins(ctx.eventId);
  res.json(admins);
});

// POST /api/events/:slug/admins — add admin (OWNER only)
router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndPermission(req, res, 'OWNER');
  if (!ctx) return;

  const targetUserId = Number(req.body?.user_id);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'user_id is required' });
  }

  const admin = await addEventAdmin(ctx.eventId, targetUserId, req.user!.userId);
  if (!admin) return res.status(404).json({ error: 'User not found' });
  res.status(201).json(admin);
});

// PATCH /api/events/:slug/admins/:userId/role — change role (OWNER only)
router.patch('/:userId/role', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndPermission(req, res, 'OWNER');
  if (!ctx) return;

  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  const newRole = req.body?.role as EventAdminRole;
  if (newRole !== 'OWNER' && newRole !== 'ADMIN') {
    return res.status(400).json({ error: 'role must be OWNER or ADMIN' });
  }

  const updated = await changeEventAdminRole(ctx.eventId, targetUserId, newRole);
  if (!updated) return res.status(404).json({ error: 'Admin not found' });
  res.json(updated);
});

// DELETE /api/events/:slug/admins/:userId — remove admin (OWNER only)
router.delete('/:userId', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventAndPermission(req, res, 'OWNER');
  if (!ctx) return;

  const targetUserId = Number(req.params.userId);
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }

  // OWNER cannot remove themselves
  if (ctx.callerRole !== 'SUPERADMIN' && targetUserId === req.user!.userId) {
    return res.status(400).json({ error: 'Event owner cannot remove themselves' });
  }

  // Cannot remove the OWNER unless you are superadmin
  const targetRole = await getEventAdminRole(ctx.eventId, targetUserId);
  if (targetRole === 'OWNER' && ctx.callerRole !== 'SUPERADMIN') {
    return res.status(400).json({ error: 'Cannot remove the event owner' });
  }

  const deleted = await removeEventAdmin(ctx.eventId, targetUserId);
  if (!deleted) return res.status(404).json({ error: 'Admin not found' });
  res.status(204).send();
});

export default router;
