import { Router, type Request, type Response, type NextFunction } from 'express';
import type {
  CreateTicketRequest,
  CreateTicketResponse,
  ListTicketsResponse,
  GetTicketResponse,
  TransitionTicketRequest,
  TransitionTicketResponse,
} from '@tracker/types';
import { getPool } from '../db/pool.js';
import { listTickets, getTicketById, getStatusId } from '../db/tickets.js';
import { submitTicket, transitionTicket } from '../services/lifecycle.js';
import {
  flagTicketForReview,
  clearReviewFlag,
  closeAsDuplicate,
  getDuplicateOf,
  listReadyForReviewTickets,
  getPlanningSignal,
} from '../db/moderation.js';
import {
  requireTrackerAuth,
  requirePermission,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const router = Router();

/** POST /tracker/api/tickets — submit a new ticket */
router.post(
  '/',
  requireTrackerAuth,
  requirePermission('ticket.create'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const body = req.body as CreateTicketRequest;
    const { title, description, type_id, domain_id, severity, reproducibility } = body;

    if (
      typeof title !== 'string' ||
      !title.trim() ||
      typeof description !== 'string' ||
      !description.trim() ||
      typeof type_id !== 'number' ||
      typeof domain_id !== 'number'
    ) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, description, type_id, and domain_id are required.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const result = await submitTicket(sql, (req as AuthenticatedRequest).trackerUser.id, {
        title: title.trim(),
        description: description.trim(),
        type_id,
        domain_id,
        ...(severity !== undefined && { severity }),
        ...(reproducibility !== undefined && { reproducibility }),
      });
      const body2: CreateTicketResponse = { id: result.id };
      res.status(201).json(body2);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets — list tickets (paginated) */
router.get(
  '/',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawLimit = Number(req.query.limit ?? 25);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 25;
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;

    try {
      const sql = getPool();
      const { tickets, total } = await listTickets(sql, { limit, offset });
      const body: ListTicketsResponse = { tickets, total, limit, offset };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/ready-for-review — tickets flagged for committee review */
router.get(
  '/ready-for-review',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const tickets = await listReadyForReviewTickets(sql);
      res.json({ tickets });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/planning-signal — open tickets ranked by vote count */
router.get(
  '/planning-signal',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const rawTypeId = req.query['type_id'];
    const rawDomainId = req.query['domain_id'];
    const typeId = typeof rawTypeId === 'string' && rawTypeId ? Number(rawTypeId) : undefined;
    const domainId =
      typeof rawDomainId === 'string' && rawDomainId ? Number(rawDomainId) : undefined;

    try {
      const sql = getPool();
      const tickets = await getPlanningSignal(sql, typeId, domainId);
      res.json({ tickets });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /tracker/api/tickets/:id — get a single ticket */
router.get(
  '/:id',
  requireTrackerAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const ticket = await getTicketById(sql, id);
      if (!ticket) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Ticket not found.',
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }
      const body: GetTicketResponse = ticket;
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

/** PATCH /tracker/api/tickets/:id/status — transition ticket to a new status */
router.patch(
  '/:id/status',
  requireTrackerAuth,
  requirePermission('ticket.transition'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const { to_status, resolution_note } = req.body as TransitionTicketRequest;
    if (typeof to_status !== 'string' || !to_status) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'to_status is required.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();
      const authed = req as AuthenticatedRequest;
      const result = await transitionTicket(
        sql,
        id,
        to_status,
        authed.trackerUser.id,
        authed.trackerUser.role,
        resolution_note,
      );

      if (!result.ok) {
        const statusCode = result.reason === 'ticket_not_found' ? 404 : 422;
        const code =
          result.reason === 'ticket_not_found'
            ? 'NOT_FOUND'
            : result.reason === 'transition_not_allowed'
              ? 'FORBIDDEN'
              : 'VALIDATION_ERROR';
        res.status(statusCode).json({
          error: {
            code,
            message: result.reason,
            correlationId: authed.correlationId,
          },
        });
        return;
      }

      const ticket = await getTicketById(sql, id);
      if (!ticket) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Ticket not found after transition.',
            correlationId: authed.correlationId,
          },
        });
        return;
      }

      const responseBody: TransitionTicketResponse = {
        id: ticket.id,
        status_slug: ticket.status_slug,
      };
      res.json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/tickets/:id/flag — mark ticket ready for committee review */
router.post(
  '/:id/flag',
  requireTrackerAuth,
  requirePermission('ticket.flag_for_review'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }
    try {
      const sql = getPool();
      await flagTicketForReview(sql, id, (req as AuthenticatedRequest).trackerUser.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/** DELETE /tracker/api/tickets/:id/flag — clear the ready-for-review flag */
router.delete(
  '/:id/flag',
  requireTrackerAuth,
  requirePermission('ticket.flag_for_review'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }
    try {
      const sql = getPool();
      await clearReviewFlag(sql, id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

/** POST /tracker/api/tickets/:id/duplicate — close a ticket as duplicate of another */
router.post(
  '/:id/duplicate',
  requireTrackerAuth,
  requirePermission('ticket.triage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const id = req.params['id'] as string | undefined;
    if (!id) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: 'Ticket not found.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    const { canonical_ticket_id } = req.body as { canonical_ticket_id?: string };
    if (!canonical_ticket_id || typeof canonical_ticket_id !== 'string') {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'canonical_ticket_id is required.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    if (canonical_ticket_id === id) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'A ticket cannot be a duplicate of itself.',
          correlationId: (req as AuthenticatedRequest).correlationId,
        },
      });
      return;
    }

    try {
      const sql = getPool();

      // Ensure canonical ticket exists and is not itself a duplicate
      const canonical = await getTicketById(sql, canonical_ticket_id);
      if (!canonical) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Canonical ticket not found.',
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      const canonicalDuplicateOf = await getDuplicateOf(sql, canonical_ticket_id);
      if (canonicalDuplicateOf !== null) {
        res.status(422).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The canonical ticket is itself a duplicate.',
            correlationId: (req as AuthenticatedRequest).correlationId,
          },
        });
        return;
      }

      const closedStatusId = await getStatusId(sql, 'closed');
      await closeAsDuplicate(
        sql,
        id,
        canonical_ticket_id,
        closedStatusId,
        (req as AuthenticatedRequest).trackerUser.id,
      );
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

export { router as ticketsRouter };
