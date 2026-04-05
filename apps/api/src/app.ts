import express, { type Request, type Response } from 'express';
import http from 'http';
import { pool } from './config/db';
import { env } from './config/env';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';
import mockHanabRoutes from './modules/simulation/mock-hanab.routes';

export const app = express();

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

// Proxy /tracker/* requests to the tracker service running on TRACKER_PORT (default 4001).
// The tracker is spawned as a subprocess from index.ts on startup.
// Note: GitHub webhook routes (/tracker/api/webhooks/github) require raw body for HMAC
// verification; re-serialisation here means webhook signatures will not verify.
app.use('/tracker', (req: Request, res: Response) => {
  const trackerPort = parseInt(process.env['TRACKER_PORT'] ?? '4001', 10);

  const body =
    req.body && typeof req.body === 'object' && Object.keys(req.body as object).length > 0
      ? JSON.stringify(req.body)
      : undefined;

  const proxyHeaders: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) proxyHeaders[k] = v as string | string[];
  }
  if (body) {
    proxyHeaders['content-type'] = 'application/json';
    proxyHeaders['content-length'] = String(Buffer.byteLength(body));
  } else {
    delete proxyHeaders['content-length'];
  }
  delete proxyHeaders['transfer-encoding'];

  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: trackerPort,
      path: req.originalUrl,
      method: req.method,
      headers: proxyHeaders,
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode ?? 502;
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v !== undefined) res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Tracker service unavailable' });
    }
  });

  if (body) proxyReq.write(body);
  proxyReq.end();
});

// Global error handler (for any thrown errors)
app.use(errorHandler);
