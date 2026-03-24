import { Router, type Response } from 'express';
import { authOptional, type AuthenticatedRequest } from '../../middleware/authMiddleware';
import { getEventBySlug } from '../events/events.service';
import { getStage } from './stages.service';
import {
  getSeededLeaderboard,
  getGauntletLeaderboard,
  getMatchPlayStandings,
} from '../leaderboards/leaderboards.service';

// Mounted at /api/events/:slug/stages/:stageId (mergeParams: true)
// Routes:
//   GET /leaderboard — stage leaderboard (mechanism-dependent)
const router = Router({ mergeParams: true });

// GET /api/events/:slug/stages/:stageId/leaderboard
router.get('/leaderboard', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const stageId = Number(req.params.stageId);

  if (!Number.isInteger(stageId) || stageId <= 0) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERADMIN';
  const event = await getEventBySlug(slug, isAdmin);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const stage = await getStage(event.id, stageId);
  if (!stage) return res.status(404).json({ error: 'Stage not found' });

  const teamSizeParam = req.query.team_size;
  const teamSizeFilter = teamSizeParam !== undefined ? Number(teamSizeParam) : null;
  const hasTeamSizeFilter =
    teamSizeFilter !== null && Number.isInteger(teamSizeFilter) && teamSizeFilter > 0;

  if (stage.mechanism === 'SEEDED_LEADERBOARD') {
    const leaderboard = await getSeededLeaderboard(stageId);
    if (!leaderboard) return res.status(404).json({ error: 'Stage not found' });
    const entries = hasTeamSizeFilter
      ? leaderboard.entries.filter((e) => e.team_size === teamSizeFilter)
      : leaderboard.entries;
    return res.json({ ...leaderboard, entries });
  }

  if (stage.mechanism === 'GAUNTLET') {
    const leaderboard = await getGauntletLeaderboard(stageId);
    if (!leaderboard) return res.status(404).json({ error: 'Stage not found' });
    const entries = hasTeamSizeFilter
      ? leaderboard.entries.filter((e) => e.team_size === teamSizeFilter)
      : leaderboard.entries;
    return res.json({ ...leaderboard, entries });
  }

  if (stage.mechanism === 'MATCH_PLAY') {
    const standings = await getMatchPlayStandings(stageId);
    if (!standings) return res.status(404).json({ error: 'Stage not found' });
    // team_size filter applied to entries (teams have team_size from event_teams)
    const entries = hasTeamSizeFilter
      ? standings.entries.filter((e) => e.team.members.length === teamSizeFilter)
      : standings.entries;
    return res.json({ ...standings, entries });
  }

  return res
    .status(501)
    .json({ error: 'Leaderboard not yet implemented for this stage mechanism' });
});

export default router;
