import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { HealthResponse, TrackerErrorResponse } from '@tracker/types';
import { checkDbHealth } from './db/pool.js';
import { ticketsRouter } from './routes/tickets.js';
import { discussionRouter } from './routes/discussion.js';
import { meRouter } from './routes/me.js';
import { usersRouter } from './routes/users.js';
import { lookupsRouter } from './routes/lookups.js';
import { adminRouter } from './routes/admin.js';
import { templatesRouter } from './routes/templates.js';
import { testRouter } from './routes/test.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  // Capture raw body for GitHub webhook HMAC verification before JSON parsing
  app.use(
    '/tracker/api/webhooks/github',
    express.raw({ type: 'application/json', limit: '1mb' }),
    (req: Request, _res: Response, next: NextFunction) => {
      (req as Request & { rawBody?: Buffer }).rawBody = req.body as Buffer;
      next();
    },
  );

  app.use(express.json({ limit: '1mb' }));

  // Attach correlation id to every tracker request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { correlationId: string }).correlationId = randomUUID();
    next();
  });

  // API routes
  app.use('/tracker/api/tickets', ticketsRouter);
  app.use('/tracker/api/tickets/:ticketId', discussionRouter);
  app.use('/tracker/api/me', meRouter);
  app.use('/tracker/api/users', usersRouter);
  app.use('/tracker/api/lookups', lookupsRouter);
  app.use('/tracker/api', adminRouter);
  app.use('/tracker/api/templates', templatesRouter);

  // Test-only endpoints — never mounted in production
  if (process.env['NODE_ENV'] !== 'production') {
    app.use('/tracker/api/test', testRouter);
  }

  // Health checks — no auth required
  app.get('/tracker/health', (_req: Request, res: Response) => {
    const body: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
    res.json(body);
  });

  app.get('/tracker/health/db', async (_req: Request, res: Response) => {
    const healthy = await checkDbHealth();
    if (healthy) {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'unavailable', timestamp: new Date().toISOString() });
    }
  });

  // In E2E test mode, serve the built tracker client so a single server
  // handles both the API and the SPA — all relative /tracker/api/* calls
  // resolve naturally without a separate proxy or port.
  if (process.env['TRACKER_SERVE_CLIENT'] === '1') {
    const clientDist = join(__dirname, '../../../../tracker/client/dist');
    app.use('/tracker', express.static(clientDist));
    app.get('/tracker/*path', (_req: Request, res: Response) => {
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

  // 404 handler for unmatched tracker routes
  app.use('/tracker', (_req: Request, res: Response) => {
    const body: TrackerErrorResponse = {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested tracker resource was not found.',
        correlationId: (_req as Request & { correlationId: string }).correlationId ?? randomUUID(),
      },
    };
    res.status(404).json(body);
  });

  // Global error handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const correlationId =
      (req as Request & { correlationId?: string }).correlationId ?? randomUUID();
    logger.error({ correlationId, err }, 'Unhandled tracker error');
    const body: TrackerErrorResponse = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        correlationId,
      },
    };
    res.status(500).json(body);
  });

  return app;
}
