import { Router, type Response } from 'express';
import { authRequired, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getEventAdminRole } from '../events/event-admins.service';
import { listStages } from '../stages/stages.service';
import { listGameSlots } from '../stages/games.service';
import { ingestGameSlot, reprocessGameKPIs } from './ingestion.service';

// Mounted at /api/events/:slug/pull-replays (mergeParams: true)
const router = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helper — admin-only context
// ---------------------------------------------------------------------------

async function resolveAdminContext(
  req: AuthenticatedRequest,
  res: Response,
): Promise<{
  eventId: number;
  allowedTeamSizes: number[];
  registrationCutoff: Date | null;
  allowLateRegistration: boolean;
  multiRegistration: string;
} | null> {
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

  return {
    eventId: event.id,
    allowedTeamSizes: event.allowed_team_sizes,
    registrationCutoff: event.registration_cutoff ?? null,
    allowLateRegistration: event.allow_late_registration ?? false,
    multiRegistration: event.multi_registration ?? 'ONE_PER_SIZE',
  };
}

// ---------------------------------------------------------------------------
// POST /api/events/:slug/pull-replays
//
// Streams newline-delimited JSON (NDJSON) progress events:
//   { type: 'start',  total: number }
//   { type: 'slot',   slotId, slotName, ingested, skipped, errors }
//   { type: 'done',   totalIngested, totalSkipped, totalErrors }
//   { type: 'error',  message }   — only on fatal pre-processing failures
// ---------------------------------------------------------------------------

router.post('/', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  // Collect all game slots across all stages for this event
  const stages = await listStages(ctx.eventId);
  const allSlots = (await Promise.all(stages.map((stage) => listGameSlots(stage.id)))).flat();
  const seedSlots = allSlots.filter((s) => s.effective_seed !== null);

  // Switch to streaming NDJSON response
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx proxy buffering

  const emit = (event: object) => res.write(JSON.stringify(event) + '\n');

  if (seedSlots.length === 0) {
    emit({ type: 'done', totalIngested: 0, totalSkipped: 0, totalErrors: [] });
    res.end();
    return;
  }

  emit({ type: 'start', total: seedSlots.length });

  let totalIngested = 0;
  let totalSkipped = 0;
  const totalErrors: string[] = [];

  for (const slot of seedSlots) {
    let slotResult;
    try {
      slotResult = await ingestGameSlot({
        slotId: slot.id,
        eventId: ctx.eventId,
        allowedTeamSizes: ctx.allowedTeamSizes,
        effectiveSeed: slot.effective_seed!,
        effectiveVariantId: slot.effective_variant_id,
        eventMeta: {
          registration_cutoff: ctx.registrationCutoff,
          allow_late_registration: ctx.allowLateRegistration,
          multi_registration: ctx.multiRegistration,
        },
      });
    } catch (err) {
      slotResult = { ingested: 0, skipped: 0, errors: [String(err)] };
    }

    totalIngested += slotResult.ingested;
    totalSkipped += slotResult.skipped;
    totalErrors.push(...slotResult.errors);

    emit({
      type: 'slot',
      slotId: slot.id,
      slotName: slot.nickname ?? slot.effective_seed,
      ingested: slotResult.ingested,
      skipped: slotResult.skipped,
      errors: slotResult.errors,
    });
  }

  emit({ type: 'done', totalIngested, totalSkipped, totalErrors });
  res.end();
});

// ---------------------------------------------------------------------------
// POST /api/events/:slug/pull-replays/reprocess
//
// Re-derives KPIs (BDR, strikes, clues remaining) from stored export data
// without hitting hanab.live.  Returns { updated, skipped, errors }.
// ---------------------------------------------------------------------------

router.post('/reprocess', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const ctx = await resolveAdminContext(req, res);
  if (!ctx) return;

  try {
    const result = await reprocessGameKPIs(ctx.eventId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
