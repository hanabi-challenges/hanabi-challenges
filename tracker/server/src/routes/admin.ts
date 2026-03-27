import { Router, type Request, type Response, type NextFunction } from 'express';
import { env } from '../env.js';
import { getPool } from '../db/pool.js';
import {
  getLinkedOpenTickets,
  getFailedWebhooks,
  getTicketsMissingGithubLink,
} from '../db/github.js';
import {
  validateGithubSignature,
  receiveGithubWebhook,
  processWebhookQueue,
} from '../services/github.js';
import { requireTrackerAuth, requirePermission } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /tracker/api/webhooks/github
// Validates HMAC-SHA256 signature, stores payload, returns 200 immediately.
// Background processor runs after response is sent.
// ---------------------------------------------------------------------------
router.post('/webhooks/github', async (req: Request, res: Response): Promise<void> => {
  const secret = env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Integration dormant — still return 200 so GitHub doesn't retry
    res.status(200).end();
    return;
  }

  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody: Buffer = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.from('');

  if (!validateGithubSignature(rawBody, signature, secret)) {
    logger.warn({ signature }, 'github webhook: invalid signature');
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const githubEvent = (req.headers['x-github-event'] as string | undefined) ?? 'unknown';

  const sql = getPool();
  try {
    await receiveGithubWebhook(sql, githubEvent, req.body as unknown);
  } catch (err) {
    logger.error({ err }, 'github webhook: failed to log payload');
    // Still return 200 — GitHub should not retry due to our internal errors
  }

  res.status(200).end();

  // Fire-and-forget processor after response
  void processWebhookQueue(sql);
});

// ---------------------------------------------------------------------------
// GET /tracker/api/admin/reconcile — committee only
// Checks which in_review tickets are missing github_links rows.
// ---------------------------------------------------------------------------
router.get(
  '/admin/reconcile',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const linked = await getLinkedOpenTickets(sql);
      const missing = await getTicketsMissingGithubLink(sql);
      res.json({ linked, missing });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /tracker/api/admin/github-failures — committee only
// Returns failed inbound webhook log entries and tickets missing github_links.
// ---------------------------------------------------------------------------
router.get(
  '/admin/github-failures',
  requireTrackerAuth,
  requirePermission('ticket.decide'),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sql = getPool();
      const [failedWebhooks, ticketsMissingLink] = await Promise.all([
        getFailedWebhooks(sql),
        getTicketsMissingGithubLink(sql),
      ]);
      res.json({ failed_webhooks: failedWebhooks, tickets_missing_link: ticketsMissingLink });
    } catch (err) {
      next(err);
    }
  },
);

export { router as adminRouter };
