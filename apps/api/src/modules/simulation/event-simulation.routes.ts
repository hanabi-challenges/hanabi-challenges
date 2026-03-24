// Event simulation HTTP routes — admin-only, SIMULATION_MODE only.
//
// Mounted at /api/events/:slug via events.routes.ts.
//
// Routes:
//   POST   /:slug/simulate          — run simulation across all TEAM stages
//   GET    /:slug/simulate/results  — fetch ingested simulation results
//   DELETE /:slug/simulate/results  — clear all simulation data (allows re-run)

import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { env } from '../../config/env';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import {
  runEventSimulation,
  getEventSimulationResults,
  clearEventSimulationResults,
  type EventSimulationOptions,
} from './event-simulation.service';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Permission helper
// ---------------------------------------------------------------------------

async function resolveEventSimContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; slug: string } | null> {
  if (!env.SIMULATION_MODE) {
    res.status(403).json({ error: 'Simulation mode is not enabled on this server' });
    return null;
  }

  const slug = String(req.params.slug);

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isSuperadmin = req.user!.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, true);
  if (!event) {
    res.status(404).json({ error: 'Event not found' });
    return null;
  }

  const role = isSuperadmin ? 'SUPERADMIN' : await getEventAdminRole(event.id, userId);
  if (!role) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }

  return { eventId: event.id, slug };
}

// ---------------------------------------------------------------------------
// POST /simulate — run event-level simulation across all TEAM stages
// ---------------------------------------------------------------------------

router.post('/simulate', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventSimContext(req, res);
  if (!ctx) return;

  const body = req.body as { teamsPerSize?: unknown };
  const options: EventSimulationOptions = {};
  if (typeof body.teamsPerSize === 'number' && body.teamsPerSize > 0) {
    options.teamsPerSize = Math.floor(body.teamsPerSize);
  }

  try {
    const result = await runEventSimulation(ctx.slug, options);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /simulate/results — fetch ingested simulation results for all stages
// ---------------------------------------------------------------------------

router.get('/simulate/results', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveEventSimContext(req, res);
  if (!ctx) return;

  try {
    const results = await getEventSimulationResults(ctx.slug);
    res.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /simulate/results — clear all event simulation data
// ---------------------------------------------------------------------------

router.delete(
  '/simulate/results',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveEventSimContext(req, res);
    if (!ctx) return;

    try {
      const result = await clearEventSimulationResults(ctx.slug);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  },
);

export default router;
