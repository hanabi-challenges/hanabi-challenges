import { Router, type Request, type Response, type NextFunction } from 'express';
import type {
  LookupsResponse,
  TicketTypeLookup,
  DomainLookup,
  StatusLookup,
  TicketTypeSlug,
  DomainSlug,
  StatusSlug,
} from '@tracker/types';
import { getPool } from '../db/pool.js';
import { requireTrackerAuth } from '../middleware/auth.js';

const router = Router();

/** GET /tracker/api/lookups — returns ticket types, domains, and statuses */
router.get(
  '/',
  requireTrackerAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();

      const [ticketTypes, domains, statuses] = await Promise.all([
        sql<{ id: number; slug: TicketTypeSlug; name: string }[]>`
          SELECT id, slug, name FROM ticket_types ORDER BY sort_order
        `,
        sql<{ id: number; slug: DomainSlug; name: string }[]>`
          SELECT id, slug, name FROM domains ORDER BY sort_order
        `,
        sql<{ id: number; slug: StatusSlug; name: string; is_terminal: boolean }[]>`
          SELECT id, slug, name, is_terminal FROM statuses ORDER BY id
        `,
      ]);

      const body: LookupsResponse = {
        ticket_types: ticketTypes as TicketTypeLookup[],
        domains: domains as DomainLookup[],
        statuses: statuses as StatusLookup[],
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

export { router as lookupsRouter };
