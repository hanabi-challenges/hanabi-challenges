// src/modules/events/event.service.ts
import { pool } from '../../config/db';

export class EventNameExistsError extends Error {
  code = 'EVENT_NAME_EXISTS';
}

export class EventGameTemplateExistsError extends Error {
  code = 'EVENT_GAME_TEMPLATE_EXISTS';
}

export interface Event {
  id: number;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string;
  published: boolean;
  event_format: 'challenge' | 'tournament' | 'session_ladder';
  event_status: 'DORMANT' | 'LIVE' | 'COMPLETE';
  owner_user_id: number | null;
  round_robin_enabled: boolean;
  max_teams: number | null;
  max_rounds: number | null;
  allow_late_registration: boolean;
  registration_opens_at: string | null;
  registration_cutoff: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface EventStage {
  event_stage_id: number;
  event_id: number;
  stage_index: number;
  label: string;
  stage_type: 'SINGLE' | 'ROUND_ROBIN' | 'BRACKET' | 'GAUNTLET';
  starts_at: string | null;
  ends_at: string | null;
  config_json: unknown;
  created_at: string;
}

export interface EventGameTemplate {
  id: number;
  event_stage_id: number;
  template_index: number;
  variant: string;
  seed_payload: string | null;
  metadata_json: unknown;
  created_at: string;
}

export interface EventTeam {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
  team_size: number;
}

export interface EventDetail {
  id: number;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string;
  published: boolean;
  event_format: 'challenge' | 'tournament' | 'session_ladder';
  event_status: 'DORMANT' | 'LIVE' | 'COMPLETE';
  owner_user_id: number | null;
  round_robin_enabled: boolean;
  max_teams: number | null;
  max_rounds: number | null;
  allow_late_registration: boolean;
  registration_opens_at: string | null;
  registration_cutoff: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

export interface EventBadgeSetLink {
  id: number;
  event_id: number;
  badge_set_id: number;
  purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
  sort_order: number;
  created_at: string;
}

export interface ChallengeBadgeAwardConfig {
  podium_enabled: boolean;
  completion_enabled: boolean;
  completion_requires_deadline: boolean;
}

export interface EventDeletePreview {
  id: number;
  slug: string;
  name: string;
  consequences: {
    teams_removed: number;
    games_removed: number;
    sessions_removed: number;
    rounds_removed: number;
    badges_removed: number;
    badge_awards_removed: number;
    memberships_removed: number;
  };
}

export interface CreateEventInput {
  name: string;
  slug: string;
  short_description?: string | null;
  long_description: string;
  published?: boolean;
  event_format?: 'challenge' | 'tournament' | 'session_ladder';
  event_status?: 'DORMANT' | 'LIVE' | 'COMPLETE';
  owner_user_id?: number | null;
  round_robin_enabled?: boolean;
  max_teams?: number | null;
  max_rounds?: number | null;
  allow_late_registration?: boolean;
  registration_opens_at?: string | null;
  registration_cutoff?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface UpdateEventInput {
  name?: string;
  slug?: string;
  short_description?: string | null;
  long_description?: string;
  published?: boolean;
  event_format?: 'challenge' | 'tournament' | 'session_ladder';
  event_status?: 'DORMANT' | 'LIVE' | 'COMPLETE';
  owner_user_id?: number | null;
  round_robin_enabled?: boolean;
  max_teams?: number | null;
  max_rounds?: number | null;
  allow_late_registration?: boolean;
  registration_opens_at?: string | null;
  registration_cutoff?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

/* ------------------------------------------
 * List all events
 * ----------------------------------------*/
export async function listEvents(options: { includeUnpublished?: boolean } = {}): Promise<Event[]> {
  const includeUnpublished = options.includeUnpublished ?? false;
  const where = includeUnpublished ? '' : 'WHERE published = TRUE';

  const result = await pool.query<Event>(
    `
    SELECT
      id,
      slug,
      name,
      short_description,
      long_description,
      published,
      event_format,
      event_status,
      owner_user_id,
      round_robin_enabled,
      max_teams,
      max_rounds,
      allow_late_registration,
      registration_opens_at,
      registration_cutoff,
      starts_at,
      ends_at
    FROM events
    ${where}
    ORDER BY starts_at NULLS LAST, id
    `,
  );

  return result.rows;
}

/* ------------------------------------------
 * Create a new event
 * ----------------------------------------*/
export async function createEvent(input: CreateEventInput) {
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
    owner_user_id = null,
    round_robin_enabled = false,
    max_teams = null,
    max_rounds = null,
    allow_late_registration,
    registration_opens_at,
    registration_cutoff,
  } = input;

  if (!slug) {
    throw { code: 'EVENT_SLUG_REQUIRED' } as { code: string };
  }
  if (!long_description) {
    throw { code: 'EVENT_LONG_DESCRIPTION_REQUIRED' } as { code: string };
  }

  let safeOwnerUserId: number | null = owner_user_id ?? null;
  if (safeOwnerUserId != null) {
    const ownerCheck = await pool.query<{ id: number }>(`SELECT id FROM users WHERE id = $1`, [
      safeOwnerUserId,
    ]);
    if (ownerCheck.rowCount === 0) {
      safeOwnerUserId = null;
    }
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO events (
        name,
        slug,
        short_description,
        long_description,
        published,
        event_format,
        event_status,
        owner_user_id,
        round_robin_enabled,
        max_teams,
        max_rounds,
        allow_late_registration,
        registration_opens_at,
        registration_cutoff,
        starts_at,
        ends_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, name, slug, short_description, long_description, published, event_format, event_status, owner_user_id, round_robin_enabled, max_teams, max_rounds, allow_late_registration, registration_opens_at, registration_cutoff, starts_at, ends_at, created_at;
      `,
      [
        name,
        slug,
        short_description ?? null,
        long_description,
        published ?? false,
        event_format,
        event_status,
        safeOwnerUserId,
        round_robin_enabled,
        max_teams,
        max_rounds,
        allow_late_registration ?? true,
        registration_opens_at ?? null,
        registration_cutoff ?? null,
        starts_at ?? null,
        ends_at ?? null,
      ],
    );

    return result.rows[0];
  } catch (err) {
    const pgErr = err as { code?: string };

    if (pgErr.code === '23505') {
      throw new EventNameExistsError('Event name or slug must be unique');
    }
    throw err;
  }
}

/* ------------------------------------------
 * Update an event by slug
 * ----------------------------------------*/
export async function updateEventBySlug(slug: string, input: UpdateEventInput) {
  const existing = await getEventBySlug(slug, { includeUnpublished: true });
  if (!existing) {
    throw new Error('EVENT_NOT_FOUND');
  }

  const next = {
    name: input.name ?? existing.name,
    slug: input.slug ?? existing.slug,
    short_description:
      input.short_description !== undefined ? input.short_description : existing.short_description,
    long_description: input.long_description ?? existing.long_description,
    published: input.published ?? existing.published,
    event_format: input.event_format ?? (existing as EventDetail).event_format ?? 'challenge',
    event_status: input.event_status ?? (existing as EventDetail).event_status ?? 'DORMANT',
    owner_user_id:
      input.owner_user_id !== undefined
        ? input.owner_user_id
        : ((existing as EventDetail).owner_user_id ?? null),
    round_robin_enabled:
      input.round_robin_enabled !== undefined
        ? input.round_robin_enabled
        : ((existing as EventDetail).round_robin_enabled ?? false),
    max_teams:
      input.max_teams !== undefined
        ? input.max_teams
        : ((existing as EventDetail).max_teams ?? null),
    max_rounds:
      input.max_rounds !== undefined
        ? input.max_rounds
        : ((existing as EventDetail).max_rounds ?? null),
    allow_late_registration:
      input.allow_late_registration !== undefined
        ? input.allow_late_registration
        : existing.allow_late_registration,
    registration_opens_at:
      input.registration_opens_at !== undefined
        ? input.registration_opens_at
        : ((existing as EventDetail).registration_opens_at ?? null),
    registration_cutoff:
      input.registration_cutoff !== undefined
        ? input.registration_cutoff
        : existing.registration_cutoff,
    starts_at: input.starts_at !== undefined ? input.starts_at : existing.starts_at,
    ends_at: input.ends_at !== undefined ? input.ends_at : existing.ends_at,
  };

  const result = await pool.query<Event>(
    `
    UPDATE events
    SET
      name = $1,
      slug = $2,
      short_description = $3,
      long_description = $4,
      published = $5,
      event_format = $6,
      event_status = $7,
      owner_user_id = $8,
      round_robin_enabled = $9,
      max_teams = $10,
      max_rounds = $11,
      allow_late_registration = $12,
      registration_opens_at = $13,
      registration_cutoff = $14,
      starts_at = $15,
      ends_at = $16
    WHERE slug = $17
    RETURNING id, slug, name, short_description, long_description, published, event_format, event_status, owner_user_id, round_robin_enabled, max_teams, max_rounds, allow_late_registration, registration_opens_at, registration_cutoff, starts_at, ends_at;
    `,
    [
      next.name,
      next.slug,
      next.short_description,
      next.long_description,
      next.published,
      next.event_format,
      next.event_status,
      next.owner_user_id,
      next.round_robin_enabled,
      next.max_teams,
      next.max_rounds,
      next.allow_late_registration,
      next.registration_opens_at,
      next.registration_cutoff,
      next.starts_at,
      next.ends_at,
      slug,
    ],
  );

  return result.rows[0];
}

/* ------------------------------------------
 * Delete an event by slug
 * ----------------------------------------*/
export async function deleteEventBySlug(slug: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const eventIdResult = await client.query<{ id: number }>(
      `
      SELECT id
      FROM events
      WHERE slug = $1
      FOR UPDATE
      `,
      [slug],
    );

    const eventId = eventIdResult.rows[0]?.id;
    if (!eventId) {
      await client.query('ROLLBACK');
      return false;
    }

    // Session-ladder records
    await client.query(`DELETE FROM event_rating_ledger WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_player_ratings WHERE event_id = $1`, [eventId]);
    await client.query(
      `DELETE FROM event_session_presence WHERE session_id IN (
      SELECT id FROM event_sessions WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM event_session_round_team_results WHERE round_id IN (
      SELECT r.id
      FROM event_session_rounds r
      JOIN event_sessions s ON s.id = r.session_id
      WHERE s.event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM event_session_round_players WHERE round_id IN (
      SELECT r.id
      FROM event_session_rounds r
      JOIN event_sessions s ON s.id = r.session_id
      WHERE s.event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM event_session_rounds WHERE session_id IN (
      SELECT id FROM event_sessions WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(`DELETE FROM event_sessions WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_session_ladder_config WHERE event_id = $1`, [eventId]);

    // Team/game records
    await client.query(
      `DELETE FROM game_participants WHERE event_game_id IN (
      SELECT g.id
      FROM event_games g
      JOIN event_teams t ON t.id = g.event_team_id
      WHERE t.event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM event_games WHERE event_team_id IN (
      SELECT id FROM event_teams WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM event_stage_team_statuses WHERE event_team_id IN (
      SELECT id FROM event_teams WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM pending_team_members WHERE event_team_id IN (
      SELECT id FROM event_teams WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(
      `DELETE FROM team_memberships WHERE event_team_id IN (
      SELECT id FROM event_teams WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(`DELETE FROM event_teams WHERE event_id = $1`, [eventId]);

    // Stage/template records
    await client.query(
      `DELETE FROM event_game_templates WHERE event_stage_id IN (
      SELECT event_stage_id FROM event_stages WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(`DELETE FROM event_stages WHERE event_id = $1`, [eventId]);

    // Badge records
    await client.query(
      `DELETE FROM event_badge_awards WHERE event_badge_id IN (
      SELECT id FROM event_badges WHERE event_id = $1
    )`,
      [eventId],
    );
    await client.query(`DELETE FROM event_badges WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_badge_set_links WHERE event_id = $1`, [eventId]);

    // Membership/eligibility records
    await client.query(`DELETE FROM event_memberships WHERE event_id = $1`, [eventId]);
    await client.query(`DELETE FROM event_player_eligibilities WHERE event_id = $1`, [eventId]);

    const result = await client.query(
      `
      DELETE FROM events
      WHERE id = $1
      `,
      [eventId],
    );

    await client.query('COMMIT');
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------------------
 * Delete preview for an event by slug
 * ----------------------------------------*/
export async function getEventDeletePreviewBySlug(
  slug: string,
): Promise<EventDeletePreview | null> {
  const eventResult = await pool.query<{ id: number; slug: string; name: string }>(
    `
    SELECT id, slug, name
    FROM events
    WHERE slug = $1
    `,
    [slug],
  );
  if (eventResult.rowCount === 0) {
    return null;
  }
  const row = eventResult.rows[0];

  async function tableExists(tableName: string): Promise<boolean> {
    const exists = await pool.query<{ reg: string | null }>(`SELECT to_regclass($1) AS reg`, [
      tableName,
    ]);
    return Boolean(exists.rows[0]?.reg);
  }

  async function countIfExists(tableName: string, sql: string, params: unknown[]): Promise<number> {
    if (!(await tableExists(tableName))) return 0;
    const res = await pool.query<{ count: string }>(sql, params);
    return Number(res.rows[0]?.count ?? 0);
  }

  const teamsRemoved = await countIfExists(
    'event_teams',
    `SELECT COUNT(*)::text AS count FROM event_teams WHERE event_id = $1`,
    [row.id],
  );
  const gamesRemoved = await countIfExists(
    'event_games',
    `
    SELECT COUNT(*)::text AS count
    FROM event_games g
    JOIN event_teams t ON t.id = g.event_team_id
    WHERE t.event_id = $1
    `,
    [row.id],
  );
  const sessionsRemoved = await countIfExists(
    'event_sessions',
    `SELECT COUNT(*)::text AS count FROM event_sessions WHERE event_id = $1`,
    [row.id],
  );
  const roundsRemoved =
    (await tableExists('event_sessions')) && (await tableExists('event_session_rounds'))
      ? await countIfExists(
          'event_session_rounds',
          `
          SELECT COUNT(*)::text AS count
          FROM event_session_rounds r
          JOIN event_sessions s ON s.id = r.session_id
          WHERE s.event_id = $1
          `,
          [row.id],
        )
      : 0;
  const badgesRemoved = await countIfExists(
    'event_badges',
    `SELECT COUNT(*)::text AS count FROM event_badges WHERE event_id = $1`,
    [row.id],
  );
  const badgeAwardsRemoved =
    (await tableExists('event_badges')) && (await tableExists('event_badge_awards'))
      ? await countIfExists(
          'event_badge_awards',
          `
          SELECT COUNT(*)::text AS count
          FROM event_badge_awards a
          JOIN event_badges b ON b.id = a.event_badge_id
          WHERE b.event_id = $1
          `,
          [row.id],
        )
      : 0;
  const membershipsRemoved = await countIfExists(
    'event_memberships',
    `SELECT COUNT(*)::text AS count FROM event_memberships WHERE event_id = $1`,
    [row.id],
  );

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    consequences: {
      teams_removed: teamsRemoved,
      games_removed: gamesRemoved,
      sessions_removed: sessionsRemoved,
      rounds_removed: roundsRemoved,
      badges_removed: badgesRemoved,
      badge_awards_removed: badgeAwardsRemoved,
      memberships_removed: membershipsRemoved,
    },
  };
}

/* ------------------------------------------
 * Get an event by slug
 * ----------------------------------------*/
export async function getEventBySlug(
  slug: string,
  options: { includeUnpublished?: boolean } = {},
): Promise<EventDetail | null> {
  const includeUnpublished = options.includeUnpublished ?? false;

  const result = await pool.query<EventDetail>(
    `
    SELECT
      id,
      slug,
      name,
      short_description,
      long_description,
      published,
      event_format,
      event_status,
      owner_user_id,
      round_robin_enabled,
      max_teams,
      max_rounds,
      allow_late_registration,
      registration_opens_at,
      registration_cutoff,
      starts_at,
      ends_at
    FROM events
    WHERE slug = $1
      ${includeUnpublished ? '' : 'AND published = TRUE'}
    `,
    [slug],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}

/* ------------------------------------------
 * List game templates for an event (by event ID)
 * ----------------------------------------*/
export async function listEventGameTemplates(eventId: number): Promise<EventGameTemplate[]> {
  const result = await pool.query<EventGameTemplate>(
    `
    SELECT
      egt.id,
      egt.event_stage_id,
      egt.template_index,
      egt.variant,
      egt.seed_payload,
      egt.max_score,
      egt.metadata_json,
      egt.created_at
    FROM event_game_templates egt
    JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
    WHERE es.event_id = $1
    ORDER BY es.stage_index, egt.template_index;
    `,
    [eventId],
  );

  return result.rows;
}

/* ------------------------------------------
 * Create a game template for an event stage
 * ----------------------------------------*/
export async function createEventGameTemplate(
  eventStageId: number,
  input: {
    template_index: number;
    variant?: string | null;
    seed_payload?: string | null;
    max_score?: number | null;
    metadata_json?: unknown;
  },
): Promise<EventGameTemplate> {
  const {
    template_index,
    variant = null,
    seed_payload = null,
    max_score = 25,
    metadata_json = {},
  } = input;
  const normalizedVariant = variant ?? 'No Variant';
  const normalizedMaxScore = max_score ?? 25;
  const normalizedMetadata = metadata_json ?? {};

  try {
    const result = await pool.query<EventGameTemplate>(
      `
      INSERT INTO event_game_templates (
        event_stage_id,
        template_index,
        variant,
        seed_payload,
        max_score,
        metadata_json
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, event_stage_id, template_index, variant, seed_payload, max_score, metadata_json, created_at;
      `,
      [
        eventStageId,
        template_index,
        normalizedVariant,
        seed_payload,
        normalizedMaxScore,
        normalizedMetadata,
      ],
    );

    return result.rows[0];
  } catch (err) {
    const pgErr = err as { code?: string };

    if (pgErr.code === '23505') {
      throw new EventGameTemplateExistsError(
        'Template already exists for this stage with that index',
      );
    }
    throw err;
  }
}

/* ------------------------------------------
 * List teams for an event (by event ID)
 * ----------------------------------------*/
export async function listEventTeams(eventId: number): Promise<EventTeam[]> {
  const result = await pool.query<EventTeam>(
    `
    SELECT
      t.id,
      t.event_id,
      t.name,
      t.created_at,
      t.team_size,
      stats.completed_games,
      stats.perfect_games,
      stats.avg_bdr,
      stats.avg_score,
      totals.total_templates
    FROM event_teams t
    LEFT JOIN (
      SELECT
        g.event_team_id,
        COUNT(g.id) AS completed_games,
        COUNT(*) FILTER (WHERE g.score = egt.max_score) AS perfect_games,
        AVG(g.bottom_deck_risk)::decimal AS avg_bdr,
        AVG(g.score)::decimal AS avg_score
      FROM event_games g
      JOIN event_game_templates egt ON egt.id = g.event_game_template_id
      GROUP BY g.event_team_id
    ) stats ON stats.event_team_id = t.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS total_templates
      FROM event_game_templates egt
      JOIN event_stages es ON es.event_stage_id = egt.event_stage_id
      WHERE es.event_id = t.event_id
    ) totals ON TRUE
    WHERE t.event_id = $1
    ORDER BY t.id;
    `,
    [eventId],
  );

  return result.rows;
}

/* ------------------------------------------
 * Create an event stage
 * ----------------------------------------*/
export async function createEventStage(input: {
  event_id: number;
  stage_index: number;
  label: string;
  stage_type: EventStage['stage_type'];
  starts_at?: string | null;
  ends_at?: string | null;
  config_json?: unknown;
}): Promise<EventStage> {
  const {
    event_id,
    stage_index,
    label,
    stage_type,
    starts_at = null,
    ends_at = null,
    config_json = {},
  } = input;
  const normalizedConfig = config_json ?? {};

  const result = await pool.query<EventStage>(
    `
    INSERT INTO event_stages (
      event_id,
      stage_index,
      label,
      stage_type,
      starts_at,
      ends_at,
      config_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      event_stage_id,
      event_id,
      stage_index,
      label,
      stage_type,
      starts_at,
      ends_at,
      config_json,
      created_at;
    `,
    [event_id, stage_index, label, stage_type, starts_at, ends_at, normalizedConfig],
  );

  return result.rows[0];
}

export async function listEventBadgeSetLinks(eventId: number): Promise<EventBadgeSetLink[]> {
  const result = await pool.query<EventBadgeSetLink>(
    `
    SELECT id, event_id, badge_set_id, purpose, sort_order, created_at
    FROM event_badge_set_links
    WHERE event_id = $1
    ORDER BY sort_order, id
    `,
    [eventId],
  );
  return result.rows;
}

const defaultChallengeBadgeAwardConfig: ChallengeBadgeAwardConfig = {
  podium_enabled: true,
  completion_enabled: true,
  completion_requires_deadline: false,
};

async function ensureChallengeBadgeConfigTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_challenge_badge_config (
      event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
      podium_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      completion_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      completion_requires_deadline BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let challengeBadgeConfigSchemaEnsured = false;

export async function ensureChallengeBadgeConfigSchema(): Promise<void> {
  if (challengeBadgeConfigSchemaEnsured) return;
  await ensureChallengeBadgeConfigTable();
  challengeBadgeConfigSchemaEnsured = true;
}

export async function getChallengeBadgeAwardConfig(
  eventId: number,
): Promise<ChallengeBadgeAwardConfig> {
  try {
    await ensureChallengeBadgeConfigSchema();
  } catch {
    return { ...defaultChallengeBadgeAwardConfig };
  }

  const result = await pool.query<ChallengeBadgeAwardConfig>(
    `
    SELECT podium_enabled, completion_enabled, completion_requires_deadline
    FROM event_challenge_badge_config
    WHERE event_id = $1
    LIMIT 1
    `,
    [eventId],
  );

  if (!result.rowCount) {
    return { ...defaultChallengeBadgeAwardConfig };
  }

  return result.rows[0];
}

export async function upsertChallengeBadgeAwardConfig(
  eventId: number,
  patch: Partial<ChallengeBadgeAwardConfig>,
): Promise<ChallengeBadgeAwardConfig> {
  await ensureChallengeBadgeConfigSchema();

  const existing = await getChallengeBadgeAwardConfig(eventId);
  const next: ChallengeBadgeAwardConfig = {
    podium_enabled:
      patch.podium_enabled !== undefined ? Boolean(patch.podium_enabled) : existing.podium_enabled,
    completion_enabled:
      patch.completion_enabled !== undefined
        ? Boolean(patch.completion_enabled)
        : existing.completion_enabled,
    completion_requires_deadline:
      patch.completion_requires_deadline !== undefined
        ? Boolean(patch.completion_requires_deadline)
        : existing.completion_requires_deadline,
  };

  const result = await pool.query<ChallengeBadgeAwardConfig>(
    `
    INSERT INTO event_challenge_badge_config (
      event_id,
      podium_enabled,
      completion_enabled,
      completion_requires_deadline,
      updated_at
    )
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (event_id) DO UPDATE
    SET
      podium_enabled = EXCLUDED.podium_enabled,
      completion_enabled = EXCLUDED.completion_enabled,
      completion_requires_deadline = EXCLUDED.completion_requires_deadline,
      updated_at = NOW()
    RETURNING podium_enabled, completion_enabled, completion_requires_deadline
    `,
    [eventId, next.podium_enabled, next.completion_enabled, next.completion_requires_deadline],
  );

  return result.rows[0];
}

export async function replaceEventBadgeSetLinks(
  eventId: number,
  links: Array<{
    badge_set_id: number;
    purpose: 'season_overall' | 'session_winner' | 'challenge_overall';
    sort_order?: number;
  }>,
): Promise<EventBadgeSetLink[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM event_badge_set_links WHERE event_id = $1`, [eventId]);

    for (let idx = 0; idx < links.length; idx += 1) {
      const link = links[idx];
      await client.query(
        `
        INSERT INTO event_badge_set_links (event_id, badge_set_id, purpose, sort_order)
        VALUES ($1, $2, $3, $4)
        `,
        [eventId, link.badge_set_id, link.purpose, link.sort_order ?? idx],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return listEventBadgeSetLinks(eventId);
}

export async function listEventStages(eventId: number): Promise<EventStage[]> {
  const result = await pool.query<EventStage>(
    `
    SELECT
      event_stage_id,
      event_id,
      stage_index,
      label,
      stage_type,
      starts_at,
      ends_at,
      config_json,
      created_at
    FROM event_stages
    WHERE event_id = $1
    ORDER BY stage_index, event_stage_id
    `,
    [eventId],
  );

  return result.rows;
}
