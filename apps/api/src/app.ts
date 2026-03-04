import express from 'express';
import { pool } from './config/db';
import routes from './routes';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

app.use(express.json());

// Very verbose request logging (all requests, then filtered API details)
app.use((req, res, next) => {
  const started = Date.now();
  console.log('[req]', req.method, req.originalUrl);

  const shouldLogBody =
    req.originalUrl.startsWith('/api/events') ||
    req.originalUrl.startsWith('/api/event-teams') ||
    req.originalUrl.startsWith('/api/results') ||
    req.originalUrl.startsWith('/api/users');

  if (shouldLogBody) {
    console.log('[req:details]', {
      method: req.method,
      path: req.originalUrl,
      query: req.query,
      body: req.body,
    });
  }

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

// Health check: verifies DB connectivity
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ status: 'error', db: 'fail' });
  }
});

// Mount API routes
app.use(routes);

// Global error handler (for any thrown errors)
app.use(errorHandler);
