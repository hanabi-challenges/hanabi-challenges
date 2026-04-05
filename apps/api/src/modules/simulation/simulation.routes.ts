// Simulation HTTP routes — admin-only, SIMULATION_MODE only.
//
// Mounted at /api/events/:slug/stages/:stageId via stages.routes.ts.
//
// Routes:
//   POST   /simulate              — run TEAM stage simulation (write + ingest)
//   POST   /simulate/opt-ins      — phase 1: populate INDIVIDUAL stage opt-ins
//   POST   /simulate/games        — phase 2: simulate games for awake QUEUED teams
//   GET    /simulate/status       — counts of opt-ins, teams, results
//   GET    /simulate/results      — fetch ingested simulation results
//   DELETE /simulate/results      — clear all simulation data (allows re-run)

import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { env } from '../../config/env';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { getStage } from '../stages/stages.service';
import {
  runStageSimulation,
  populateSimulatedOptIns,
  simulateQueuedGames,
  getSimulationStatus,
  getStageSimulationResults,
  clearStageSimulationResults,
  type SimulationOptions,
  type OptInOptions,
} from './stage-simulation.service';

const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Permission helper
// ---------------------------------------------------------------------------

async function resolveSimContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{ eventId: number; stageId: number } | null> {
  if (!env.SIMULATION_MODE) {
    res.status(403).json({ error: 'Simulation mode is not enabled on this server' });
    return null;
  }

  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);
  if (!Number.isInteger(stageId) || stageId <= 0) {
    res.status(400).json({ error: 'Invalid stageId' });
    return null;
  }

  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const isSuperadmin = req.user?.roles?.includes('SUPERADMIN') ?? false;
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

  const stage = await getStage(event.id, stageId);
  if (!stage) {
    res.status(404).json({ error: 'Stage not found' });
    return null;
  }

  return { eventId: event.id, stageId };
}

// ---------------------------------------------------------------------------
// POST /simulate — run TEAM stage simulation
// ---------------------------------------------------------------------------

router.post('/simulate', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveSimContext(req, res);
  if (!ctx) return;

  const body = req.body as { teamsPerSize?: unknown };
  const options: SimulationOptions = {};
  if (typeof body.teamsPerSize === 'number' && body.teamsPerSize > 0) {
    options.teamsPerSize = Math.floor(body.teamsPerSize);
  }

  try {
    const result = await runStageSimulation(ctx.stageId, options);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /simulate/opt-ins — phase 1: populate INDIVIDUAL stage opt-ins
// ---------------------------------------------------------------------------

router.post('/simulate/opt-ins', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveSimContext(req, res);
  if (!ctx) return;

  const body = req.body as { playerCount?: unknown; sleepFraction?: unknown };
  const options: OptInOptions = {};
  if (typeof body.playerCount === 'number' && body.playerCount >= 2) {
    options.playerCount = Math.floor(body.playerCount);
  }
  if (
    typeof body.sleepFraction === 'number' &&
    body.sleepFraction >= 0 &&
    body.sleepFraction <= 1
  ) {
    options.sleepFraction = body.sleepFraction;
  }

  try {
    const result = await populateSimulatedOptIns(ctx.stageId, options);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// POST /simulate/games — phase 2: simulate games for awake QUEUED teams
// ---------------------------------------------------------------------------

router.post('/simulate/games', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveSimContext(req, res);
  if (!ctx) return;

  try {
    const result = await simulateQueuedGames(ctx.stageId);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /simulate/status — phase status (opt-ins, teams, results counts)
// ---------------------------------------------------------------------------

router.get('/simulate/status', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveSimContext(req, res);
  if (!ctx) return;

  try {
    const status = await getSimulationStatus(ctx.stageId);
    res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// GET /simulate/results — fetch ingested simulation results
// ---------------------------------------------------------------------------

router.get('/simulate/results', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveSimContext(req, res);
  if (!ctx) return;

  try {
    const results = await getStageSimulationResults(ctx.stageId);
    res.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /simulate/results — clear all simulation data
// ---------------------------------------------------------------------------

router.delete(
  '/simulate/results',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const ctx = await resolveSimContext(req, res);
    if (!ctx) return;

    try {
      const result = await clearStageSimulationResults(ctx.stageId);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  },
);

export default router;
