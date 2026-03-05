// src/modules/events/event.routes.ts
import { Router, Request, Response } from 'express';
import {
  authRequired,
  authOptional,
  requireAdmin,
  AuthenticatedRequest,
} from '../../middleware/authMiddleware';
import {
  listEvents,
  createEvent,
  listEventGameTemplates,
  listEventStages,
  createEventGameTemplate,
  listEventTeams,
  getEventBySlug,
  createEventStage,
  listEventBadgeSetLinks,
  getChallengeBadgeAwardConfig,
  replaceEventBadgeSetLinks,
  upsertChallengeBadgeAwardConfig,
  updateEventBySlug,
  deleteEventBySlug,
  getEventDeletePreviewBySlug,
} from './event.service';
import {
  findEligibilityForUsers,
  listEligibilityForUser,
  markIneligible,
  upsertEnrolledIfMissing,
  hasBlockingStatus,
} from './event-eligibility.service';
import { concedeEventSpoilers, hasConcededEventSpoilers } from './spoiler-concession.service';
import { pool } from '../../config/db';
import { listTeamMembers } from '../teams/team.service';
import { validateSlug } from '../../utils/slug';
import { getErrorCode, getErrorDetail, isAdminUser, validateLength } from './event.routes.helpers';
import {
  extractReplayExportPlayers,
  extractReplayHistoryGames,
  normalizeReplayEndCondition,
} from '../replay/replay-parse';

const router = Router();

type ReplayHistoryGame = {
  id?: string | number | null;
  gameId?: string | number | null;
  game_id?: string | number | null;
  variantName?: string | null;
  variant?: string | null;
  options?: {
    variantName?: string | null;
    variant?: string | null;
    cardCycle?: boolean | null;
    deckPlays?: boolean | null;
    emptyClues?: boolean | null;
    oneExtraCard?: boolean | null;
    oneLessCard?: boolean | null;
    allOrNothing?: boolean | null;
    detrimentalCharacters?: boolean | null;
  } | null;
  cardCycle?: boolean | null;
  deckPlays?: boolean | null;
  emptyClues?: boolean | null;
  oneExtraCard?: boolean | null;
  oneLessCard?: boolean | null;
  allOrNothing?: boolean | null;
  detrimentalCharacters?: boolean | null;
  score?: number | string | null;
  endCondition?: number | null;
  datetimeStarted?: string | null;
  datetimeFinished?: string | null;
  datetimeFinishedUtc?: string | null;
  datetime_finished?: string | null;
};

const MAX_NAME_LENGTH = 100;
const MAX_DESC_LENGTH = 10000;
const MAX_SHORT_DESC_LENGTH = 500;
const MAX_TEAM_NAME_LENGTH = 100;

/* ------------------------------------------
 *  Helper: look up numeric event_id from slug
 * ----------------------------------------*/
async function getEventId(slug: string): Promise<number | null> {
  const result = await pool.query<{ id: number }>(`SELECT id FROM events WHERE slug = $1`, [slug]);
  return result.rowCount > 0 ? result.rows[0].id : null;
}

/* ------------------------------------------
 *  GET /api/events
 * ----------------------------------------*/
router.get('/', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const includeUnpublished = isAdminUser(req);
    const events = await listEvents({ includeUnpublished });
    res.json(events);
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/eligibility/me
 *  Return ineligibility rows for the current user (optionally filtered by team_size)
 * ----------------------------------------*/
router.get(
  '/:slug/eligibility/me',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const teamSizeRaw =
      (req.query.team_size as string | undefined) ?? (req.query.teamSize as string | undefined);
    const teamSize = teamSizeRaw != null ? Number(teamSizeRaw) : null;

    if (teamSizeRaw != null && (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 6)) {
      return res.status(400).json({ error: 'team_size must be an integer between 2 and 6' });
    }

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      const entries = await listEligibilityForUser({
        eventId,
        userId: req.user!.userId,
        teamSize: teamSize ?? undefined,
      });

      res.json(entries);
    } catch (err) {
      console.error('Error fetching eligibility:', err);
      res.status(500).json({ error: 'Failed to fetch eligibility' });
    }
  },
);

/* ------------------------------------------
 *  POST /api/events/:slug/eligibility/spoilers
 *  Mark the current user as ineligible for a team size due to spoilers
 * ----------------------------------------*/
router.post(
  '/:slug/eligibility/spoilers',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const {
      team_size,
      teamSize,
      source_event_team_id,
      sourceEventTeamId,
      reason,
      all_team_sizes,
      allTeamSizes,
    } = req.body ?? {};

    const applyAll = Boolean(all_team_sizes ?? allTeamSizes);
    const sizeValue = applyAll ? null : (team_size ?? teamSize);
    const parsedSize = sizeValue != null ? Number(sizeValue) : null;
    if (
      !applyAll &&
      (parsedSize == null || !Number.isInteger(parsedSize) || parsedSize < 2 || parsedSize > 6)
    ) {
      return res.status(400).json({ error: 'team_size must be an integer between 2 and 6' });
    }

    const sourceTeamIdRaw = source_event_team_id ?? sourceEventTeamId;
    const sourceTeamId = sourceTeamIdRaw != null ? Number(sourceTeamIdRaw) : null;

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      if (sourceTeamId != null && parsedSize != null) {
        const teamCheck = await pool.query<{ event_id: number; team_size: number }>(
          `SELECT event_id, team_size FROM event_teams WHERE id = $1`,
          [sourceTeamId],
        );
        const teamRow = teamCheck.rows[0];
        if (!teamRow || teamRow.event_id !== eventId) {
          return res.status(400).json({ error: 'source_event_team_id must belong to this event' });
        }
        if (teamRow && teamRow.team_size !== parsedSize) {
          return res.status(400).json({
            error: `source_event_team_id is a ${teamRow.team_size}p team, not ${parsedSize}p`,
          });
        }
      }

      const userId = req.user!.userId;
      await concedeEventSpoilers({
        eventId,
        userId,
        reason: typeof reason === 'string' ? reason : 'spoiler_view',
      });
      const sizesToApply = applyAll ? [2, 3, 4, 5, 6] : [parsedSize!];

      const existingRows = await listEligibilityForUser({
        eventId,
        userId,
      });

      // Block if any enrolled exists and we are applying to all, or if the specific size is enrolled
      if (applyAll) {
        if (
          hasBlockingStatus(
            existingRows.filter((r) => sizesToApply.includes(r.team_size)),
            'ENROLLED',
          )
        ) {
          return res
            .status(403)
            .json({ error: 'Cannot view spoilers while enrolled for any team size' });
        }
      } else {
        const existingForSize = existingRows.find((r) => r.team_size === parsedSize);
        if (existingForSize?.status === 'ENROLLED') {
          return res
            .status(403)
            .json({ error: 'Cannot view spoilers while enrolled for this team size' });
        }
      }

      const results = [];
      for (const size of sizesToApply) {
        const current = existingRows.find((r) => r.team_size === size);
        if (current && (current.status === 'INELIGIBLE' || current.status === 'COMPLETED')) {
          results.push(current);
          continue;
        }
        const updated = await markIneligible({
          eventId,
          teamSize: size,
          userId,
          sourceEventTeamId: sourceTeamId,
          reason: typeof reason === 'string' ? reason : undefined,
        });
        results.push(updated);
      }

      res.status(201).json({ updated: results });
    } catch (err) {
      console.error('Error marking spoiler ineligibility:', err);
      res.status(500).json({ error: 'Failed to update eligibility' });
    }
  },
);

/* ------------------------------------------
 *  GET /api/events/:slug/memberships
 *  List user memberships for this event (for client-side validation)
 * ----------------------------------------*/
router.get('/:slug/memberships', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const result = await pool.query(
      `
      SELECT
        tm.user_id,
        u.display_name,
        et.team_size,
        et.id AS event_team_id
      FROM team_memberships tm
      JOIN event_teams et ON et.id = tm.event_team_id
      JOIN users u ON u.id = tm.user_id
      WHERE et.event_id = $1;
      `,
      [eventId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching event memberships:', err);
    res.status(500).json({ error: 'Failed to fetch memberships' });
  }
});

/* ------------------------------------------
 *  POST /api/events/:slug/register
 *  Create a team and add members (existing or pending)
 * ----------------------------------------*/
router.post('/:slug/register', authRequired, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);
  const { team_name, team_size, members } = req.body;
  const currentUserId = req.user?.userId;

  if (!team_name || team_size == null || !Array.isArray(members)) {
    return res.status(400).json({ error: 'team_name, team_size, and members are required' });
  }

  const teamNameError = validateLength('team_name', team_name, {
    min: 2,
    max: MAX_TEAM_NAME_LENGTH,
  });
  if (teamNameError) {
    return res.status(400).json({ error: teamNameError });
  }

  const sizeNum = Number(team_size);
  if (!Number.isInteger(sizeNum) || sizeNum < 2 || sizeNum > 6) {
    return res.status(400).json({ error: 'team_size must be an integer between 2 and 6' });
  }

  if (!currentUserId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const memberEntries = members as Array<{
    user_id?: number;
    display_name?: string;
    role?: 'PLAYER' | 'STAFF';
  }>;

  if (memberEntries.length === 0) {
    return res.status(400).json({ error: 'At least one member is required' });
  }

  // Ensure current user is included
  const includesCurrentUser = memberEntries.some(
    (m) => m.user_id && Number(m.user_id) === currentUserId,
  );
  if (!includesCurrentUser) {
    return res.status(400).json({ error: 'Current user must be part of the team' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventResult = await client.query<{
      id: number;
      published: boolean;
      allow_late_registration: boolean;
      registration_opens_at: string | null;
      registration_cutoff: string | null;
      starts_at: string | null;
      ends_at: string | null;
    }>(
      `
      SELECT
        id,
        published,
        allow_late_registration,
        registration_opens_at,
        registration_cutoff,
        starts_at,
        ends_at
      FROM events
      WHERE slug = $1
      `,
      [slug],
    );
    if (eventResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Event not found' });
    }
    const eventRow = eventResult.rows[0] as {
      id: number;
      published: boolean;
      allow_late_registration: boolean;
      registration_opens_at: string | null;
      registration_cutoff: string | null;
      starts_at: string | null;
      ends_at: string | null;
    };
    const eventId = eventRow.id;
    const isAdmin = isAdminUser(req);
    const concededSpoilers = await hasConcededEventSpoilers({
      eventId,
      userId: currentUserId,
    });
    if (concededSpoilers) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'You have conceded spoiler protection for this event and can no longer participate.',
        code: 'INELIGIBLE_CONCEDED',
      });
    }

    const now = new Date();
    const registrationOpens = eventRow.registration_opens_at
      ? new Date(eventRow.registration_opens_at)
      : eventRow.starts_at
        ? new Date(eventRow.starts_at)
        : null;
    const startsAt = eventRow.starts_at ? new Date(eventRow.starts_at) : null;
    const endsAt = eventRow.ends_at ? new Date(eventRow.ends_at) : null;
    const cutoff = eventRow.registration_cutoff ? new Date(eventRow.registration_cutoff) : null;

    if (!isAdmin && !eventRow.published) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Registration is not open for this event' });
    }

    if (startsAt && Number.isNaN(startsAt.getTime())) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Event start time is invalid' });
    }
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Event end time is invalid' });
    }
    if (cutoff && Number.isNaN(cutoff.getTime())) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Event registration cutoff is invalid' });
    }

    if (!isAdmin) {
      if (registrationOpens && now < registrationOpens) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Registration has not opened yet' });
      }
      if (cutoff && now > cutoff && !eventRow.allow_late_registration) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Registration is closed for this event' });
      }
      if (!eventRow.allow_late_registration && endsAt && now > endsAt) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Registration is closed for this event' });
      }
    }

    // Check if any member already has a team in this event with the same size
    const memberUserIds = Array.from(
      new Set(
        memberEntries
          .map((m) => (m.user_id != null ? Number(m.user_id) : null))
          .filter((id): id is number => id != null),
      ),
    );
    if (memberUserIds.length > 0) {
      const eligibilityRows = await findEligibilityForUsers({
        eventId,
        teamSize: sizeNum,
        userIds: memberUserIds,
        client,
      });

      if (eligibilityRows.length > 0) {
        await client.query('ROLLBACK');
        const conflictList = eligibilityRows
          .map((row) => {
            const reason =
              row.status === 'ENROLLED'
                ? 'already enrolled'
                : row.status === 'COMPLETED'
                  ? 'already completed'
                  : 'ineligible (spoilers)';
            return `${row.display_name ?? `User ${row.user_id}`} (${reason})`;
          })
          .join(', ');
        return res.status(409).json({
          error: `These users cannot register for ${sizeNum}p in this event: ${conflictList}`,
        });
      }

      // Fallback to legacy membership table in case historical data hasn't populated the new eligibility table yet
      const conflictCheck = await client.query(
        `
        SELECT DISTINCT u.display_name, tm.user_id, et.id AS event_team_id
        FROM team_memberships tm
        JOIN event_teams et ON et.id = tm.event_team_id
        JOIN users u ON u.id = tm.user_id
        WHERE et.event_id = $1
          AND et.team_size = $2
          AND tm.user_id = ANY($3::int[])
        `,
        [eventId, sizeNum, memberUserIds],
      );
      if (conflictCheck.rowCount > 0) {
        // Backfill the new table so future checks use it
        await Promise.all(
          conflictCheck.rows.map((row: { user_id: number; event_team_id: number }) =>
            upsertEnrolledIfMissing({
              eventId,
              teamSize: sizeNum,
              userId: row.user_id,
              sourceEventTeamId: row.event_team_id,
            }).catch((err) => {
              console.warn('Failed to backfill eligibility entry', {
                eventId,
                teamSize: sizeNum,
                userId: row.user_id,
                eventTeamId: row.event_team_id,
                err,
              });
              return null;
            }),
          ),
        );

        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `These users already have a ${sizeNum}p team for this event: ${conflictCheck.rows
            .map((r: { display_name: string }) => r.display_name)
            .join(', ')}`,
        });
      }
    }

    const teamResult = await client.query(
      `
      INSERT INTO event_teams (event_id, name, team_size, owner_user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, event_id, name, team_size, owner_user_id, created_at;
      `,
      [eventId, team_name, sizeNum, currentUserId],
    );
    const team = teamResult.rows[0];

    const addedMembers: unknown[] = [];
    const pendingMembers: unknown[] = [];
    const registeredUserIds = new Set<number>();

    for (const m of memberEntries) {
      const role = m.role === 'STAFF' ? 'STAFF' : 'PLAYER';
      if (m.user_id) {
        const userIdNum = Number(m.user_id);
        const memberResult = await client.query(
          `
          INSERT INTO team_memberships (event_team_id, user_id, role, is_listed)
          VALUES ($1, $2, $3, true)
          RETURNING id, event_team_id, user_id, role, is_listed, created_at;
          `,
          [team.id, userIdNum, role],
        );
        const memberRow = memberResult.rows[0];

        // Fetch display name and colors
        const userResult = await client.query(
          `
          SELECT display_name, color_hex, text_color
          FROM users
          WHERE id = $1;
          `,
          [memberRow.user_id],
        );
        const userInfo = userResult.rows[0] ?? {
          display_name: 'Unknown',
          color_hex: '#777777',
          text_color: '#ffffff',
        };

        addedMembers.push({ ...memberRow, ...userInfo });

        if (!registeredUserIds.has(userIdNum)) {
          await upsertEnrolledIfMissing({
            eventId,
            teamSize: sizeNum,
            userId: userIdNum,
            sourceEventTeamId: team.id,
            client,
          });
          registeredUserIds.add(userIdNum);
        }
      } else if (m.display_name) {
        const pendingResult = await client.query(
          `
          INSERT INTO pending_team_members (event_team_id, display_name, role)
          VALUES ($1, $2, $3)
          RETURNING id, event_team_id, display_name, role, created_at;
          `,
          [team.id, m.display_name, role],
        );
        pendingMembers.push(pendingResult.rows[0]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      team,
      members: addedMembers,
      pending: pendingMembers,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    const e = err as { code?: string };
    if (e.code === '23505') {
      return res.status(409).json({ error: 'Duplicate team or member detected' });
    }

    console.error('Error registering team:', err);
    res.status(500).json({ error: 'Failed to register team' });
  } finally {
    client.release();
  }
});

/* ------------------------------------------
 *  POST /api/events/:slug/teams/:teamId/validate-replay
 *  Live-validate a replay URL/ID against team + template
 * ----------------------------------------*/
router.post(
  '/:slug/teams/:teamId/validate-replay',
  authRequired,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const teamId = String(req.params.teamId);
    const body = req.body as { template_id?: number; templateId?: number; replay?: string };
    const templateIdRaw =
      body.template_id ?? body.templateId ?? (req.query.template_id as string | undefined);
    const template_id = templateIdRaw != null ? Number(templateIdRaw) : undefined;
    const { replay } = body;
    let step = 'start';

    console.log('[validate-replay] start', {
      slug,
      teamId,
      template_id,
      replaySnippet: replay?.slice?.(0, 100),
    });

    if (!template_id || Number.isNaN(template_id) || !replay) {
      console.warn('[validate-replay] missing fields', { template_id, replayPresent: !!replay });
      return res.status(400).json({ error: 'template_id and replay are required' });
    }

    const gameId = parseGameId(replay);
    if (!gameId) {
      console.warn('[validate-replay] parse fail', { replay });
      return res.status(400).json({ error: 'Unable to parse game id from replay/link' });
    }

    const teamIdNum = Number(teamId);
    if (!Number.isInteger(teamIdNum)) {
      return res.status(400).json({ error: 'Invalid team id' });
    }

    try {
      step = 'lookup event';
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });
      console.log('[validate-replay] event', { eventId });

      step = 'lookup team';
      const teamResult = await pool.query(
        `
      SELECT id, team_size, event_id
      FROM event_teams
      WHERE id = $1 AND event_id = $2;
      `,
        [teamIdNum, eventId],
      );
      if (teamResult.rowCount === 0) {
        return res.status(404).json({ error: 'Team not found for this event' });
      }
      const team = teamResult.rows[0] as { id: number; team_size: number; event_id: number };
      console.log('[validate-replay] team', { team });

      step = 'lookup template';
      const tplResult = await pool.query(
        `
      SELECT egt.id, egt.seed_payload, egt.variant, es.event_id, es.config_json
      FROM event_game_templates egt
      JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
      WHERE egt.id = $1;
      `,
        [template_id],
      );
      if (tplResult.rowCount === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      const tpl = tplResult.rows[0] as {
        id: number;
        seed_payload: string | null;
        variant: string;
        event_id: number;
        config_json: unknown;
      };
      if (tpl.event_id !== eventId) {
        return res.status(400).json({ error: 'Template does not belong to this event' });
      }
      console.log('[validate-replay] template', { tpl });

      const members = await listTeamMembers(team.id);
      const teamPlayerPool = members
        .filter((m) => m.role === 'PLAYER')
        .map((m) => m.display_name);
      const stageConfig =
        tpl.config_json && typeof tpl.config_json === 'object' && !Array.isArray(tpl.config_json)
          ? (tpl.config_json as { enforce_exact_team_size?: unknown })
          : {};
      const enforceExactTeamMatch = stageConfig.enforce_exact_team_size === true;
      console.log('[validate-replay] members', teamPlayerPool, {
        enforceExactTeamMatch,
      });

      // Stage 1: fetch export and validate players/seed/size
      step = 'fetch export';
      const exportJson = await fetchJsonWithTimeout(`https://hanab.live/export/${gameId}`);
      console.log('[validate-replay] export fetched', {
        keys: Object.keys(exportJson ?? {}),
        players: exportJson?.players ?? exportJson?.playerNames ?? exportJson?.player_names,
        seed: exportJson?.seed,
      });
      if (!exportJson || typeof exportJson !== 'object') {
        return res.status(400).json({ error: 'Invalid export payload from hanab.live' });
      }
      const exportPlayers = extractReplayExportPlayers(exportJson);
      if (!exportPlayers || exportPlayers.length === 0) {
        return res.status(400).json({ error: 'Replay export is missing a valid players list' });
      }
      const seedString = exportJson.seed ?? '';

      const duplicatePlayers = exportPlayers.filter(
        (player) =>
          exportPlayers.findIndex((candidate: string) => candidate === player) !==
          exportPlayers.lastIndexOf(player),
      );
      if (duplicatePlayers.length > 0) {
        return res.status(400).json({
          error: `Replay includes duplicate players: ${[...new Set(duplicatePlayers)].join(', ')}`,
        });
      }

      const nonPoolPlayers = exportPlayers.filter((p) => !teamPlayerPool.includes(p));
      if (nonPoolPlayers.length > 0) {
        return res.status(400).json({
          error: `Replay includes players not in this team pool: ${nonPoolPlayers.join(', ')}`,
        });
      }
      if (enforceExactTeamMatch) {
        const missingPlayers = teamPlayerPool.filter((p) => !exportPlayers.includes(p));
        if (missingPlayers.length > 0 || exportPlayers.length !== teamPlayerPool.length) {
          return res.status(400).json({
            error: `Replay team must exactly match registered team players: ${teamPlayerPool.join(', ')}`,
          });
        }
      }

      // Check seed and player count from seed string
      const seedMatch = seedString.match(/p(\d+)v\d+s([A-Za-z0-9]+)/);
      if (!seedMatch) {
        return res.status(400).json({ error: 'Seed string from replay is not in expected format' });
      }
      const seedPlayers = Number(seedMatch[1]);
      const seedSuffix = seedMatch[2];
      console.log('[validate-replay] seed parsed', { seedPlayers, seedSuffix });
      if (seedPlayers !== team.team_size) {
        return res
          .status(400)
          .json({ error: `Replay is for ${seedPlayers}p but team is ${team.team_size}p` });
      }
      if (tpl.seed_payload && seedSuffix !== tpl.seed_payload) {
        return res.status(400).json({
          error: `Replay seed ${seedSuffix} does not match template seed ${tpl.seed_payload}`,
        });
      }

      // Stage 2: fetch history-full for first player and check variant/flags/score
      let historyData: unknown = null;
      if (exportPlayers.length > 0) {
        const player = exportPlayers[0];
        step = 'fetch history';
        historyData = await fetchJsonWithTimeout(
          `https://hanab.live/api/v1/history-full/${encodeURIComponent(player)}?start=${gameId}&end=${gameId}`,
        );
        console.log('[validate-replay] history fetched', {
          player,
          keys: historyData ? Object.keys(historyData) : [],
          array: Array.isArray(historyData),
        });
      }

      let historyVariant = null;
      let flagsOk = true;
      let score: number | null = null;
      let endCondition: number | null = null;
      let playedAt: string | null = null;

      // history-full returns an array for single-user queries. For multi-user it can be {games: []}
      const historyGames = extractReplayHistoryGames<ReplayHistoryGame>(historyData);

      if (historyGames.length > 0) {
        const game = historyGames.find(
          (g: ReplayHistoryGame) => String(g.id ?? g.gameId ?? g.game_id) === String(gameId),
        );
        if (game) {
          const opts = game.options ?? {};
          historyVariant = game.variantName ?? opts.variantName ?? game.variant ?? opts.variant;
          const flags = {
            cardCycle: game.cardCycle ?? opts.cardCycle,
            deckPlays: game.deckPlays ?? opts.deckPlays,
            emptyClues: game.emptyClues ?? opts.emptyClues,
            oneExtraCard: game.oneExtraCard ?? opts.oneExtraCard,
            oneLessCard: game.oneLessCard ?? opts.oneLessCard,
            allOrNothing: game.allOrNothing ?? opts.allOrNothing,
            detrimentalCharacters: game.detrimentalCharacters ?? opts.detrimentalCharacters,
          };
          flagsOk = Object.values(flags).every((v) => v === false || v === undefined);
          score = game.score == null ? null : Number(game.score);
          endCondition = normalizeReplayEndCondition(game.endCondition);
          playedAt =
            game.datetimeFinished ?? game.datetimeFinishedUtc ?? game.datetime_finished ?? null;
        }
      }

      if (historyVariant && historyVariant !== tpl.variant) {
        return res.status(400).json({
          error: `Replay variant ${historyVariant} does not match template variant ${tpl.variant}`,
        });
      }
      if (!flagsOk) {
        return res
          .status(400)
          .json({ error: 'Replay uses unsupported optional rules (flags should be false)' });
      }

      console.log('[validate-replay] success', {
        gameId,
        exportPlayers,
        seedString,
        derived: { seedSuffix, seedPlayers, historyVariant, score, endCondition, playedAt },
      });

      return res.json({
        ok: true,
        gameId,
        export: {
          players: exportPlayers,
          seed: seedString,
        },
        derived: {
          seedSuffix,
          teamSize: seedPlayers,
          variant: historyVariant ?? tpl.variant,
          score,
          endCondition,
          playedAt,
        },
      });
    } catch (err) {
      const e = err as { message?: string; code?: string; stack?: string };
      const message = e.message ?? 'Failed to validate replay';
      if (message === 'timeout') {
        return res.status(504).json({
          error: 'Validation timed out contacting hanab.live',
          code: 'TIMEOUT',
          details: message,
          step,
        });
      }
      console.error('Error validating replay:', err);
      res.status(502).json({
        error: `Failed to validate replay: ${message}`,
        code: e.code ?? 'FETCH_FAILED',
        details: e.stack ?? String(err),
        step,
      });
    }
  },
);

async function fetchJsonWithTimeout(url: string, ms = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) {
      throw new Error(`Request failed (${resp.status})`);
    }
    return await resp.json();
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error('timeout');
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

function parseGameId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const matchUrl = trimmed.match(/(?:replay|shared-replay)\/(\d+)/i);
  const matchId = trimmed.match(/^\d+$/);
  return matchUrl ? matchUrl[1] : matchId ? matchId[0] : null;
}
/* ------------------------------------------
 *  POST /api/events  (ADMIN)
 * ----------------------------------------*/
router.post('/', authRequired, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const {
    name,
    slug,
    short_description,
    long_description,
    starts_at,
    ends_at,
    published,
    event_format = 'challenge',
    event_status = 'DORMANT',
    round_robin_enabled = false,
    max_teams = null,
    max_rounds = null,
    allow_late_registration,
    registration_opens_at,
    registration_cutoff,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!long_description) return res.status(400).json({ error: 'long_description is required' });

  const slugError = validateSlug(slug);
  if (slugError) return res.status(400).json({ error: slugError });

  const nameError = validateLength('name', name, { min: 3, max: MAX_NAME_LENGTH });
  if (nameError) return res.status(400).json({ error: nameError });

  const shortDescError = validateLength('short_description', short_description, {
    max: MAX_SHORT_DESC_LENGTH,
  });
  if (shortDescError) return res.status(400).json({ error: shortDescError });

  const longDescError = validateLength('long_description', long_description, {
    min: 10,
    max: MAX_DESC_LENGTH,
  });
  if (longDescError) return res.status(400).json({ error: longDescError });

  const startDate = starts_at ? new Date(starts_at) : null;
  const endDate = ends_at ? new Date(ends_at) : null;
  const regOpensDate = registration_opens_at ? new Date(registration_opens_at) : null;
  const format = event_format ?? 'challenge';

  if (format !== 'challenge' && format !== 'tournament' && format !== 'session_ladder') {
    return res
      .status(400)
      .json({ error: 'event_format must be "challenge", "tournament", or "session_ladder"' });
  }

  if (event_status !== 'DORMANT' && event_status !== 'LIVE' && event_status !== 'COMPLETE') {
    return res.status(400).json({ error: 'event_status must be "DORMANT", "LIVE", or "COMPLETE"' });
  }

  const maxTeamsVal = max_teams == null ? null : Number(max_teams);
  const maxRoundsVal = max_rounds == null ? null : Number(max_rounds);
  if (Number.isNaN(maxTeamsVal) || Number.isNaN(maxRoundsVal)) {
    return res.status(400).json({ error: 'max_teams/max_rounds must be numbers when provided' });
  }
  if (maxTeamsVal != null && maxTeamsVal <= 0) {
    return res.status(400).json({ error: 'max_teams must be positive when provided' });
  }
  if (maxRoundsVal != null && maxRoundsVal <= 0) {
    return res.status(400).json({ error: 'max_rounds must be positive when provided' });
  }
  if (format === 'tournament') {
    if (
      (maxTeamsVal == null && maxRoundsVal == null) ||
      (maxTeamsVal != null && maxRoundsVal != null)
    ) {
      return res
        .status(400)
        .json({ error: 'Provide exactly one of max_teams or max_rounds for tournaments' });
    }
  }
  const normalizedMaxTeams = format === 'tournament' ? maxTeamsVal : null;
  const normalizedMaxRounds = format === 'tournament' ? maxRoundsVal : null;
  const normalizedRoundRobin = format === 'tournament' ? Boolean(round_robin_enabled) : false;

  if (starts_at && !Number.isFinite(startDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for starts_at' });
  }
  if (ends_at && !Number.isFinite(endDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for ends_at' });
  }
  if (registration_opens_at && !Number.isFinite(regOpensDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for registration_opens_at' });
  }
  if (startDate && endDate && endDate <= startDate) {
    return res.status(400).json({ error: 'ends_at must be after starts_at' });
  }
  if (regOpensDate && registration_cutoff) {
    const cutoffDate = new Date(registration_cutoff);
    if (!Number.isFinite(cutoffDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for registration_cutoff' });
    }
    if (cutoffDate <= regOpensDate) {
      return res
        .status(400)
        .json({ error: 'registration_cutoff must be after registration_opens_at' });
    }
  }

  try {
    const event = await createEvent({
      name,
      slug,
      short_description: short_description ?? null,
      long_description,
      published: published ?? false,
      event_format: format,
      event_status,
      owner_user_id: req.user?.userId ?? null,
      round_robin_enabled: normalizedRoundRobin,
      max_teams: normalizedMaxTeams,
      max_rounds: normalizedMaxRounds,
      allow_late_registration: allow_late_registration ?? true,
      registration_opens_at: registration_opens_at ?? null,
      registration_cutoff: registration_cutoff ?? null,
      starts_at: starts_at ?? null,
      ends_at: ends_at ?? null,
    });

    res.status(201).json(event);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'EVENT_NAME_EXISTS') {
      return res.status(409).json({ error: 'Event name or slug must be unique' });
    }

    console.error('Error creating event:', err);
    res.status(500).json({
      error: 'Failed to create event',
      detail: getErrorDetail(err),
      code: getErrorCode(err),
    });
  }
});

/* ------------------------------------------
 *  PUT /api/events/:slug  (ADMIN)
 * ----------------------------------------*/
router.put('/:slug', authRequired, requireAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const {
    name,
    new_slug,
    short_description,
    long_description,
    starts_at,
    ends_at,
    published,
    event_format,
    event_status,
    round_robin_enabled,
    max_teams = null,
    max_rounds = null,
    allow_late_registration,
    registration_opens_at,
    registration_cutoff,
  } = req.body;

  if (new_slug) {
    const slugError = validateSlug(new_slug);
    if (slugError) return res.status(400).json({ error: slugError });
  }

  if (name) {
    const nameError = validateLength('name', name, { min: 3, max: MAX_NAME_LENGTH });
    if (nameError) return res.status(400).json({ error: nameError });
  }

  if (short_description !== undefined) {
    const shortDescError = validateLength('short_description', short_description, {
      max: MAX_SHORT_DESC_LENGTH,
    });
    if (shortDescError) return res.status(400).json({ error: shortDescError });
  }

  if (long_description !== undefined) {
    const longDescError = validateLength('long_description', long_description, {
      min: 10,
      max: MAX_DESC_LENGTH,
    });
    if (longDescError) return res.status(400).json({ error: longDescError });
  }

  const startDate = starts_at ? new Date(starts_at) : null;
  const endDate = ends_at ? new Date(ends_at) : null;
  const regOpensDate = registration_opens_at ? new Date(registration_opens_at) : null;
  const cutoffDate = registration_cutoff ? new Date(registration_cutoff) : null;
  const format = event_format ?? undefined;

  if (format && format !== 'challenge' && format !== 'tournament' && format !== 'session_ladder') {
    return res
      .status(400)
      .json({ error: 'event_format must be "challenge", "tournament", or "session_ladder"' });
  }

  if (
    event_status !== undefined &&
    event_status !== 'DORMANT' &&
    event_status !== 'LIVE' &&
    event_status !== 'COMPLETE'
  ) {
    return res.status(400).json({ error: 'event_status must be "DORMANT", "LIVE", or "COMPLETE"' });
  }

  const maxTeamsVal = max_teams == null ? undefined : Number(max_teams);
  const maxRoundsVal = max_rounds == null ? undefined : Number(max_rounds);
  if (
    (maxTeamsVal !== undefined && Number.isNaN(maxTeamsVal)) ||
    (maxRoundsVal !== undefined && Number.isNaN(maxRoundsVal))
  ) {
    return res.status(400).json({ error: 'max_teams/max_rounds must be numbers when provided' });
  }
  if (maxTeamsVal !== undefined && maxTeamsVal <= 0) {
    return res.status(400).json({ error: 'max_teams must be positive when provided' });
  }
  if (maxRoundsVal !== undefined && maxRoundsVal <= 0) {
    return res.status(400).json({ error: 'max_rounds must be positive when provided' });
  }
  if (format === 'tournament') {
    if (
      (maxTeamsVal == null && maxRoundsVal == null) ||
      (maxTeamsVal != null && maxRoundsVal != null)
    ) {
      return res
        .status(400)
        .json({ error: 'Provide exactly one of max_teams or max_rounds for tournaments' });
    }
  }

  if (starts_at && !Number.isFinite(startDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for starts_at' });
  }
  if (ends_at && !Number.isFinite(endDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for ends_at' });
  }
  if (registration_opens_at && !Number.isFinite(regOpensDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for registration_opens_at' });
  }
  if (registration_cutoff && !Number.isFinite(cutoffDate?.getTime() ?? NaN)) {
    return res.status(400).json({ error: 'Invalid date format for registration_cutoff' });
  }
  if (startDate && endDate && endDate <= startDate) {
    return res.status(400).json({ error: 'ends_at must be after starts_at' });
  }
  if (regOpensDate && cutoffDate && cutoffDate <= regOpensDate) {
    return res
      .status(400)
      .json({ error: 'registration_cutoff must be after registration_opens_at' });
  }

  // Normalize optional tournament fields; if format not provided, leave undefined to avoid clobbering.
  const normalizedMaxTeams =
    format === 'tournament' ? (maxTeamsVal ?? null) : maxTeamsVal === undefined ? undefined : null;
  const normalizedMaxRounds =
    format === 'tournament'
      ? (maxRoundsVal ?? null)
      : maxRoundsVal === undefined
        ? undefined
        : null;
  const normalizedRoundRobin = format === 'tournament' ? Boolean(round_robin_enabled) : undefined;

  try {
    const updated = await updateEventBySlug(slug, {
      name,
      slug: new_slug ?? undefined,
      short_description: short_description ?? undefined,
      long_description,
      published,
      event_format: format,
      event_status,
      round_robin_enabled: normalizedRoundRobin,
      max_teams: normalizedMaxTeams,
      max_rounds: normalizedMaxRounds,
      allow_late_registration,
      registration_opens_at,
      registration_cutoff,
      starts_at: starts_at ?? undefined,
      ends_at: ends_at ?? undefined,
    });
    res.json(updated);
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e?.message === 'EVENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Event not found' });
    }
    if (e?.code === 'EVENT_NAME_EXISTS' || e?.code === '23505') {
      return res.status(409).json({ error: 'Event name or slug must be unique' });
    }
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/delete-preview (ADMIN)
 * ----------------------------------------*/
router.get(
  '/:slug/delete-preview',
  authRequired,
  requireAdmin,
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);

    try {
      const preview = await getEventDeletePreviewBySlug(slug);
      if (!preview) {
        return res.status(404).json({ error: 'Event not found' });
      }
      res.json(preview);
    } catch (err) {
      console.error('Error loading event delete preview:', err);
      res.status(500).json({ error: 'Failed to load delete preview' });
    }
  },
);

/* ------------------------------------------
 *  DELETE /api/events/:slug  (ADMIN)
 * ----------------------------------------*/
router.delete('/:slug', authRequired, requireAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const deleted = await deleteEventBySlug(slug);
    if (!deleted) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.status(204).send();
  } catch (err) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete event with related registrations, sessions, or results',
      });
    }
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug
 * ----------------------------------------*/
router.get('/:slug', authOptional, async (req: AuthenticatedRequest, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const includeUnpublished = isAdminUser(req);
    const event = await getEventBySlug(slug, { includeUnpublished });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (err) {
    console.error('Error fetching event by slug:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/stages
 *  Create a stage is done via POST /api/events/:slug/stages
 * ----------------------------------------*/
router.get('/:slug/stages', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const stages = await listEventStages(eventId);
    res.json(stages);
  } catch (err) {
    console.error('Error fetching event stages:', err);
    res.status(500).json({
      error: 'Failed to fetch event stages',
      detail: getErrorDetail(err),
      code: getErrorCode(err),
    });
  }
});

router.post('/:slug/stages', authRequired, requireAdmin, async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const { stage_index, label, stage_type, starts_at, ends_at, config_json } = req.body;

  if (stage_index == null || !label || !stage_type) {
    return res.status(400).json({ error: 'stage_index, label, and stage_type are required' });
  }

  if (
    config_json !== undefined &&
    (config_json === null || typeof config_json !== 'object' || Array.isArray(config_json))
  ) {
    return res.status(400).json({ error: 'config_json must be an object if provided' });
  }

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const stage = await createEventStage({
      event_id: eventId,
      stage_index,
      label,
      stage_type,
      starts_at: starts_at ?? null,
      ends_at: ends_at ?? null,
      config_json: config_json ?? {},
    });

    res.status(201).json(stage);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'stage_index must be unique within the event' });
    }

    console.error('Error creating event stage:', err);
    res.status(500).json({
      error: 'Failed to create event stage',
      detail: getErrorDetail(err),
      code: getErrorCode(err),
    });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/game-templates
 * ----------------------------------------*/
router.get('/:slug/game-templates', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const templates = await listEventGameTemplates(eventId);
    res.json(templates);
  } catch (err) {
    console.error('Error fetching templates:', err);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/badge-links
 * ----------------------------------------*/
router.get(
  '/:slug/badge-links',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      const links = await listEventBadgeSetLinks(eventId);
      res.json({ links });
    } catch (err) {
      console.error('Error fetching event badge links:', err);
      res.status(500).json({ error: 'Failed to fetch event badge links' });
    }
  },
);

/* ------------------------------------------
 *  PUT /api/events/:slug/badge-links
 * ----------------------------------------*/
router.put(
  '/:slug/badge-links',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const linksInput = Array.isArray(req.body?.links) ? req.body.links : null;

    if (!linksInput) {
      return res.status(400).json({ error: 'links array is required' });
    }

    const normalized: Array<{
      badge_set_id: number;
      purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
      sort_order: number;
    }> = [];

    for (let idx = 0; idx < linksInput.length; idx += 1) {
      const raw = linksInput[idx] as {
        badge_set_id?: unknown;
        purpose?: unknown;
        sort_order?: unknown;
      };
      const badgeSetId = Number(raw.badge_set_id);
      const purpose = raw.purpose;
      const sortOrder = raw.sort_order == null ? idx : Number(raw.sort_order);

      if (!Number.isInteger(badgeSetId) || badgeSetId <= 0) {
        return res
          .status(400)
          .json({ error: `links[${idx}].badge_set_id must be a positive integer` });
      }
      if (
        purpose !== 'season_overall' &&
        purpose !== 'session_winner' &&
        purpose !== 'challenge_overall'
      ) {
        return res.status(400).json({ error: `links[${idx}].purpose is invalid` });
      }
      if (!Number.isInteger(sortOrder) || sortOrder < 0) {
        return res
          .status(400)
          .json({ error: `links[${idx}].sort_order must be a non-negative integer` });
      }

      normalized.push({
        badge_set_id: badgeSetId,
        purpose,
        sort_order: sortOrder,
      });
    }

    // Disallow duplicate purposes in this MVP.
    const purposeSet = new Set(normalized.map((item) => item.purpose));
    if (purposeSet.size !== normalized.length) {
      return res.status(400).json({ error: 'Each purpose can appear at most once' });
    }

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      if (normalized.length > 0) {
        const ids = normalized.map((item) => item.badge_set_id);
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
        const check = await pool.query<{ id: number }>(
          `SELECT id FROM badge_sets WHERE id IN (${placeholders})`,
          ids,
        );
        if ((check.rowCount ?? 0) !== ids.length) {
          return res.status(400).json({ error: 'One or more badge_set_id values do not exist' });
        }

        // Enforce badge set is unused by other events (1:m event->badge sets).
        const usedElsewhere = await pool.query<{ badge_set_id: number; event_id: number }>(
          `
        SELECT badge_set_id, event_id
        FROM event_badge_set_links
        WHERE badge_set_id IN (${placeholders}) AND event_id <> $${ids.length + 1}
        `,
          [...ids, eventId],
        );
        if ((usedElsewhere.rowCount ?? 0) > 0) {
          return res
            .status(409)
            .json({ error: 'One or more badge sets are already attached to another event' });
        }
      }

      const links = await replaceEventBadgeSetLinks(eventId, normalized);
      res.json({ links });
    } catch (err) {
      console.error('Error updating event badge links:', err);
      res.status(500).json({
        error: 'Failed to update event badge links',
        detail: getErrorDetail(err),
        code: getErrorCode(err),
      });
    }
  },
);

/* ------------------------------------------
 *  GET /api/events/:slug/challenge-badge-config
 * ----------------------------------------*/
router.get(
  '/:slug/challenge-badge-config',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      const eventRow = await pool.query<{ event_format: string }>(
        `SELECT event_format FROM events WHERE id = $1 LIMIT 1`,
        [eventId],
      );
      if (!eventRow.rowCount) return res.status(404).json({ error: 'Event not found' });
      if (eventRow.rows[0].event_format !== 'challenge') {
        return res
          .status(400)
          .json({ error: 'Challenge badge config is only available for Challenge events' });
      }

      const config = await getChallengeBadgeAwardConfig(eventId);
      res.json(config);
    } catch (err) {
      console.error('Error fetching challenge badge config:', err);
      res.status(500).json({ error: 'Failed to fetch challenge badge config' });
    }
  },
);

/* ------------------------------------------
 *  PUT /api/events/:slug/challenge-badge-config
 * ----------------------------------------*/
router.put(
  '/:slug/challenge-badge-config',
  authRequired,
  requireAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    const slug = String(req.params.slug);
    const podiumEnabled = req.body?.podium_enabled;
    const completionEnabled = req.body?.completion_enabled;
    const completionRequiresDeadline = req.body?.completion_requires_deadline;

    if (podiumEnabled !== undefined && typeof podiumEnabled !== 'boolean') {
      return res.status(400).json({ error: 'podium_enabled must be a boolean' });
    }
    if (completionEnabled !== undefined && typeof completionEnabled !== 'boolean') {
      return res.status(400).json({ error: 'completion_enabled must be a boolean' });
    }
    if (
      completionRequiresDeadline !== undefined &&
      typeof completionRequiresDeadline !== 'boolean'
    ) {
      return res.status(400).json({ error: 'completion_requires_deadline must be a boolean' });
    }

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      const eventRow = await pool.query<{ event_format: string }>(
        `SELECT event_format FROM events WHERE id = $1 LIMIT 1`,
        [eventId],
      );
      if (!eventRow.rowCount) return res.status(404).json({ error: 'Event not found' });
      if (eventRow.rows[0].event_format !== 'challenge') {
        return res
          .status(400)
          .json({ error: 'Challenge badge config is only available for Challenge events' });
      }

      const updated = await upsertChallengeBadgeAwardConfig(eventId, {
        podium_enabled: podiumEnabled,
        completion_enabled: completionEnabled,
        completion_requires_deadline: completionRequiresDeadline,
      });
      res.json(updated);
    } catch (err) {
      console.error('Error updating challenge badge config:', err);
      res.status(500).json({ error: 'Failed to update challenge badge config' });
    }
  },
);

/* ------------------------------------------
 *  POST /api/events/:slug/game-templates  (ADMIN)
 * ----------------------------------------*/
router.post(
  '/:slug/game-templates',
  authRequired,
  requireAdmin,
  async (req: Request, res: Response) => {
    const slug = String(req.params.slug);
    const { event_stage_id, template_index, variant, seed_payload, metadata_json } = req.body;

    if (event_stage_id == null || template_index == null) {
      return res.status(400).json({ error: 'event_stage_id and template_index are required' });
    }

    if (
      metadata_json !== undefined &&
      (metadata_json === null || typeof metadata_json !== 'object' || Array.isArray(metadata_json))
    ) {
      return res.status(400).json({ error: 'metadata_json must be an object if provided' });
    }

    try {
      const eventId = await getEventId(slug);
      if (!eventId) return res.status(404).json({ error: 'Event not found' });

      // Ensure the stage belongs to this event
      const stageCheck = await pool.query<{ event_id: number }>(
        `SELECT event_id FROM event_stages WHERE event_stage_id = $1`,
        [event_stage_id],
      );
      if (stageCheck.rowCount === 0 || stageCheck.rows[0].event_id !== eventId) {
        return res.status(400).json({ error: 'event_stage_id does not belong to this event' });
      }

      const template = await createEventGameTemplate(event_stage_id, {
        template_index,
        variant: variant ?? null,
        seed_payload: seed_payload ?? null,
        metadata_json: metadata_json ?? {},
      });

      res.status(201).json(template);
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === 'EVENT_GAME_TEMPLATE_EXISTS') {
        return res.status(409).json({
          error: 'Template already exists for this stage with that index',
        });
      }

      console.error('Error creating game template:', err);
      res.status(500).json({
        error: 'Failed to create game template',
        detail: getErrorDetail(err),
        code: getErrorCode(err),
      });
    }
  },
);

/* ------------------------------------------
 *  GET /api/events/:slug/teams
 * ----------------------------------------*/
router.get('/:slug/teams', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const teams = await listEventTeams(eventId);
    res.json(teams);
  } catch (err) {
    console.error('Error fetching teams:', err);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

/* ------------------------------------------
 *  GET /api/events/:slug/stats
 *  Aggregated per-template stats for an event (filtered by team_size)
 * ----------------------------------------*/
router.get('/:slug/stats', async (req: Request, res: Response) => {
  const slug = String(req.params.slug);
  const teamSizeRaw =
    (req.query.team_size as string | undefined) ?? (req.query.teamSize as string | undefined);
  const teamSize = teamSizeRaw != null ? Number(teamSizeRaw) : null;
  if (teamSizeRaw != null && (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 6)) {
    return res.status(400).json({ error: 'team_size must be an integer between 2 and 6' });
  }

  try {
    const eventId = await getEventId(slug);
    if (!eventId) return res.status(404).json({ error: 'Event not found' });

    const result = await pool.query(
      `
      SELECT
        egt.id AS template_id,
        egt.template_index,
        egt.seed_payload,
        egt.variant,
        egt.max_score,
        COALESCE(AVG(g.score)::numeric, 0) AS avg_score,
        COALESCE(AVG(g.bottom_deck_risk)::numeric, 0) AS avg_bdr,
        COALESCE(AVG(CASE WHEN egt.max_score IS NOT NULL AND g.score = egt.max_score THEN 1 ELSE 0 END)::numeric, 0) AS avg_win_rate,
        COUNT(g.id) AS games_played
      FROM event_game_templates egt
      JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
      LEFT JOIN event_games g ON g.event_game_template_id = egt.id
      LEFT JOIN event_teams t ON t.id = g.event_team_id AND ($2::int IS NULL OR t.team_size = $2::int)
      WHERE es.event_id = $1
      GROUP BY egt.id, egt.template_index, egt.seed_payload, egt.variant, egt.max_score
      ORDER BY egt.template_index;
      `,
      [eventId, teamSize],
    );

    res.json({ templates: result.rows });
  } catch (err) {
    console.error('Error fetching event stats:', err);
    res.status(500).json({ error: 'Failed to fetch event stats' });
  }
});

export default router;
