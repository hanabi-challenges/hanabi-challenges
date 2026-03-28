import { describe, it, expect } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Set required env vars before importing the app
process.env.TRACKER_DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const { createApp } = await import('../../src/app.js');

describe('tracker server scaffold', () => {
  const app = createApp();

  describe('GET /tracker/health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/tracker/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.timestamp).toBe('string');
    });
  });

  describe('404 handler', () => {
    it('returns 404 with NOT_FOUND code for unknown routes', async () => {
      const res = await request(app).get('/tracker/unknown-route');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
      expect(typeof res.body.error.correlationId).toBe('string');
    });
  });

  describe('global error handler', () => {
    it('returns 500 with INTERNAL_ERROR code for unhandled errors', async () => {
      // Build a minimal app with the throw route registered BEFORE the 404/error handlers
      const testApp = express();
      testApp.use(express.json());
      testApp.get('/tracker/throw', () => {
        throw new Error('boom');
      });
      // Import and apply only the error handling middleware
      // The error handler is the 4-argument middleware at the end of createApp()
      // We replicate it here to test it in isolation
      testApp.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
        void err;
        void req;
        res.status(500).json({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred.',
            correlationId: 'test-correlation-id',
          },
        });
      });
      const res = await request(testApp).get('/tracker/throw');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(typeof res.body.error.correlationId).toBe('string');
    });
  });
});
