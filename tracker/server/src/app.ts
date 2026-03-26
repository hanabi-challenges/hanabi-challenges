import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'crypto';
import type { HealthResponse, TrackerErrorResponse } from '@tracker/types';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '1mb' }));

  // Attach correlation id to every tracker request
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as Request & { correlationId: string }).correlationId = randomUUID();
    next();
  });

  // Health checks — no auth required
  app.get('/tracker/health', (_req: Request, res: Response) => {
    const body: HealthResponse = { status: 'ok', timestamp: new Date().toISOString() };
    res.json(body);
  });

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
    console.error({ correlationId, err }, 'Unhandled tracker error');
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
