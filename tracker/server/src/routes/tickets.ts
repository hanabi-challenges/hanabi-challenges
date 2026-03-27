import { Router, type Request, type Response, type NextFunction } from 'express';
import type {
  CreateTicketRequest,
  CreateTicketResponse,
  ListTicketsResponse,
  GetTicketResponse,
} from '@tracker/types';
import { getPool } from '../db/pool.js';
import { listTickets, getTicketById } from '../db/tickets.js';
import { submitTicket } from '../services/lifecycle.js';
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

export { router as ticketsRouter };
