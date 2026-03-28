import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { pool } from './config/db';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import mockHanabRoutes from './modules/simulation/mock-hanab.routes';

export const app = express();

// Proxy all /tracker/** requests to the tracker server before any body parsing.
// Must be first so express.json() never consumes the body for proxied requests.
app.use(
  createProxyMiddleware({
    target: 'http://localhost:4001',
    pathFilter: '/tracker/**',
    changeOrigin: false,
    on: {
      error: (_err, _req, res) => {
        (res as express.Response).status(502).json({
          error: {
            code: 'TRACKER_UNAVAILABLE',
            message: 'Tracker service temporarily unavailable.',
          },
        });
      },
    },
  }),
);

app.use(express.json());

app.use((req, res, next) => {
  const started = Date.now();
  console.log('[req]', req.method, req.originalUrl);

  res.on('finish', () => {
    const ms = Date.now() - started;
    console.log('[res]', req.method, req.originalUrl, '=>', res.statusCode, `${ms}ms`);
  });

  next();
});

// Friendly root
app.get('/', (_req, res) => {
  res.send('Hanabi Events API is running. Try /health or /api/events');
});

// Health check: verifies DB connectivity.
// simulation_mode flag lets the frontend show/hide simulation UI.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', simulation_mode: env.SIMULATION_MODE });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', db: 'fail', simulation_mode: env.SIMULATION_MODE });
  }
});

// Mock hanab-live API — simulation/test environments only.
// Set SIMULATION_MODE=true and HANAB_LIVE_BASE_URL=http://localhost:PORT to use.
if (env.SIMULATION_MODE) {
  app.use(mockHanabRoutes);
  console.log('[simulation] Mock hanab-live routes mounted');
}

// Mount API routes
app.use(routes);

// Global error handler (for any thrown errors)
app.use(errorHandler);
