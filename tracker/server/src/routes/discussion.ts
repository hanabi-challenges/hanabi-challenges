import { Router, type Request, type Response, type NextFunction } from 'express';
import type {
  CreateCommentRequest,
  CreateCommentResponse,
  ListCommentsResponse,
  TicketPinState,
  TicketSubscriptionState,
  TicketVoteState,
} from '@tracker/types';
import { getPool } from '../db/pool.js';
import {
  insertComment,
  listComments,
  getVoteState,
  addVote,
  removeVote,
  getPinState,
  addPin,
  removePin,
  getSubscriptionState,
  subscribeToTicket,
  unsubscribeFromTicket,
} from '../db/discussion.js';
import {
  requireTrackerAuth,
  optionalTrackerAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { fanoutNotification } from '../services/notifications.js';

// All discussion routes are nested under /tracker/api/tickets/:ticketId
const router = Router({ mergeParams: true });

/** POST /tracker/api/tickets/:ticketId/comments */
router.post(
  '/comments',
  requireTrackerAuth,
  requirePermission('ticket.comment'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const { body, is_internal } = req.body as CreateCommentRequest;

    if (typeof body !== 'string' || !body.trim()) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'body is required.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const authed = req as AuthenticatedRequest;
    const canViewInternal =
      authed.trackerUser.role === 'moderator' || authed.trackerUser.role === 'committee';

    // Non-privileged users cannot post internal comments
    const isInternal = canViewInternal && (is_internal ?? false);

    try {
      const sql = getPool();
      const result = await insertComment(
        sql,
        ticketId,
        authed.trackerUser.id,
        body.trim(),
        isInternal,
      );
      // Auto-subscribe the commenter so they receive future updates
      void subscribeToTicket(sql, ticketId, authed.trackerUser.id);
      // Fanout only for public comments — internal notes don't notify community members
      if (!isInternal) {
        void fanoutNotification(sql, ticketId, authed.trackerUser.id, 'comment_added');
      }
      const responseBody: CreateCommentResponse = { id: result.id };
      res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/:ticketId/comments */
router.get(
  '/comments',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const authed = req as AuthenticatedRequest;
    const includeInternal =
      authed.trackerUser.role === 'moderator' || authed.trackerUser.role === 'committee';

    try {
      const sql = getPool();
      const comments = await listComments(sql, ticketId, includeInternal);
      const responseBody: ListCommentsResponse = { comments };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/:ticketId/votes — public; auth-aware for user_has_voted */
router.get(
  '/votes',
  optionalTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }

    try {
      const sql = getPool();
      const userId = (req as Partial<AuthenticatedRequest>).trackerUser?.id ?? null;
      const state = await getVoteState(sql, ticketId, userId);
      res.json(state satisfies TicketVoteState);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/tickets/:ticketId/votes — cast or retract a vote */
router.post(
  '/votes',
  requireTrackerAuth,
  requirePermission('ticket.vote'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const { action } = req.body as { action?: string };
    if (action !== 'add' && action !== 'remove') {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action must be "add" or "remove".',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const userId = (req as AuthenticatedRequest).trackerUser.id;

      if (action === 'add') {
        await addVote(sql, ticketId, userId);
      } else {
        await removeVote(sql, ticketId, userId);
      }

      const state = await getVoteState(sql, ticketId, userId);
      const responseBody: TicketVoteState = state;
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/:ticketId/pins — public; auth-aware for is_pinned */
router.get(
  '/pins',
  optionalTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      const userId = (req as Partial<AuthenticatedRequest>).trackerUser?.id ?? null;
      const state = await getPinState(sql, ticketId, userId);
      res.json(state satisfies TicketPinState);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/tickets/:ticketId/pins — pin a ticket */
router.post(
  '/pins',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      await addPin(sql, ticketId, (req as AuthenticatedRequest).trackerUser.id);
      const body: TicketPinState = { ticket_id: ticketId, is_pinned: true };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /tracker/api/tickets/:ticketId/pins — unpin a ticket */
router.delete(
  '/pins',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      await removePin(sql, ticketId, (req as AuthenticatedRequest).trackerUser.id);
      const body: TicketPinState = { ticket_id: ticketId, is_pinned: false };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/:ticketId/subscriptions — public; auth-aware for is_subscribed */
router.get(
  '/subscriptions',
  optionalTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      const userId = (req as Partial<AuthenticatedRequest>).trackerUser?.id ?? null;
      const state = await getSubscriptionState(sql, ticketId, userId);
      res.json(state satisfies TicketSubscriptionState);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/tickets/:ticketId/subscriptions — subscribe to a ticket */
router.post(
  '/subscriptions',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      await subscribeToTicket(sql, ticketId, (req as AuthenticatedRequest).trackerUser.id);
      const body: TicketSubscriptionState = { ticket_id: ticketId, is_subscribed: true };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /tracker/api/tickets/:ticketId/subscriptions — unsubscribe from a ticket */
router.delete(
  '/subscriptions',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ticketId = req.params['ticketId'] as string | undefined;
    if (!ticketId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found.' } });
      return;
    }
    try {
      const sql = getPool();
      await unsubscribeFromTicket(sql, ticketId, (req as AuthenticatedRequest).trackerUser.id);
      const body: TicketSubscriptionState = { ticket_id: ticketId, is_subscribed: false };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

export { router as discussionRouter };
