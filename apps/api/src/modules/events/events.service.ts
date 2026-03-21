import { pool } from '../../config/db';
import { inferEventStatus, inferEventDates, type StageForStatus } from '../../utils/status.utils';
import type { EventRow, EventResponse, CreateEventBody, UpdateEventBody } from './events.types';

// Stages are aggregated alongside each event row so status and dates
// can be inferred in a single query round-trip.
type StageInfoRaw = {
  time_policy: string;
  starts_at: string | null;
  ends_at: string | null;
};

type EventWithStagesRow = EventRow & { stages: StageInfoRaw[] };

// json_agg returns ISO strings for timestamps; convert explicitly.
function toStageForStatus(raw: StageInfoRaw): StageForStatus {
  return {
    time_policy: raw.time_policy as StageForStatus['time_policy'],
    starts_at: raw.starts_at ? new Date(raw.starts_at) : null,
    ends_at: raw.ends_at ? new Date(raw.ends_at) : null,
  };
}

function formatEvent(row: EventWithStagesRow): EventResponse {
  const stages = (row.stages ?? []).map(toStageForStatus);
  const { startsAt, endsAt } = inferEventDates(stages);
  const status = inferEventStatus(
    {
      registration_opens_at: row.registration_opens_at,
      registration_cutoff: row.registration_cutoff,
    },
    stages,
    new Date(),
  );
  return { ...row, status, starts_at: startsAt, ends_at: endsAt, stage_count: stages.length };
}

// Reusable base SELECT — caller adds WHERE / GROUP BY / ORDER BY.
const BASE_QUERY = `
  SELECT
    e.*,
    COALESCE(
      json_agg(
        json_build_object(
          'time_policy', es.time_policy,
          'starts_at',   es.starts_at,
          'ends_at',     es.ends_at
        ) ORDER BY es.stage_index
      ) FILTER (WHERE es.id IS NOT NULL),
      '[]'::json
    ) AS stages
  FROM events e
  LEFT JOIN event_stages es ON es.event_id = e.id
`;

export async function listEvents(includeUnpublished = false): Promise<EventResponse[]> {
  const publishedFilter = includeUnpublished ? '' : 'WHERE e.published = TRUE';
  const result = await pool.query<EventWithStagesRow>(
    `${BASE_QUERY} ${publishedFilter} GROUP BY e.id ORDER BY e.created_at DESC, e.id DESC`,
  );
  return result.rows.map(formatEvent);
}

export async function getEventBySlug(
  slug: string,
  includeUnpublished = false,
): Promise<EventResponse | null> {
  const publishedFilter = includeUnpublished ? '' : 'AND e.published = TRUE';
  const result = await pool.query<EventWithStagesRow>(
    `${BASE_QUERY} WHERE e.slug = $1 ${publishedFilter} GROUP BY e.id`,
    [slug],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return formatEvent(result.rows[0]);
}

export async function createEvent(
  body: CreateEventBody,
  createdBy: number,
): Promise<EventResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<EventRow>(
      `INSERT INTO events (
         slug, name, short_description, long_description,
         registration_mode, allowed_team_sizes, combined_leaderboard,
         team_scope, variant_rule_json, seed_rule_json, aggregate_config_json,
         registration_opens_at, registration_cutoff, allow_late_registration,
         multi_registration, auto_pull_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        body.slug,
        body.name,
        body.short_description ?? null,
        body.long_description,
        body.registration_mode ?? 'ACTIVE',
        body.allowed_team_sizes,
        body.combined_leaderboard ?? false,
        body.team_scope ?? null,
        body.variant_rule_json ?? null,
        body.seed_rule_json ?? null,
        body.aggregate_config_json ?? null,
        body.registration_opens_at ?? null,
        body.registration_cutoff ?? null,
        body.allow_late_registration ?? true,
        body.multi_registration ?? 'ONE_PER_SIZE',
        body.auto_pull_json ?? null,
      ],
    );

    const event = result.rows[0];
    await client.query(
      `INSERT INTO event_admins (event_id, user_id, role, granted_by) VALUES ($1, $2, 'OWNER', NULL)`,
      [event.id, createdBy],
    );

    await client.query('COMMIT');

    const row = event as EventWithStagesRow;
    row.stages = [];
    return formatEvent(row);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Updateable fields — slug is the identifier and is never changed via PUT.
const UPDATABLE_FIELDS = [
  'name',
  'short_description',
  'long_description',
  'registration_mode',
  'allowed_team_sizes',
  'combined_leaderboard',
  'team_scope',
  'variant_rule_json',
  'seed_rule_json',
  'aggregate_config_json',
  'registration_opens_at',
  'registration_cutoff',
  'allow_late_registration',
  'multi_registration',
  'auto_pull_json',
] as const;

export async function updateEvent(
  slug: string,
  body: UpdateEventBody,
): Promise<EventResponse | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  for (const key of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      fields.push(`${key} = $${values.length + 1}`);
      values.push((body as Record<string, unknown>)[key] ?? null);
    }
  }

  if (fields.length > 0) {
    values.push(slug);
    const result = await pool.query(
      `UPDATE events SET ${fields.join(', ')} WHERE slug = $${values.length} RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
  }

  return getEventBySlug(slug, true);
}

export async function togglePublished(slug: string): Promise<EventResponse | null> {
  const result = await pool.query(
    `UPDATE events SET published = NOT published WHERE slug = $1 RETURNING id`,
    [slug],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getEventBySlug(slug, true);
}

export async function deleteEvent(slug: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM events WHERE slug = $1`, [slug]);
  return (result.rowCount ?? 0) > 0;
}

export async function cloneEvent(
  slug: string,
  createdBy: number,
): Promise<EventResponse | 'not_found' | 'slug_taken'> {
  const source = await getEventBySlug(slug, true);
  if (!source) return 'not_found';

  const newSlug = `${source.slug}-copy`;
  const newName = `${source.name} (Copy)`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query<EventRow>(
      `INSERT INTO events (
         slug, name, short_description, long_description,
         published, registration_mode, allowed_team_sizes, combined_leaderboard,
         variant_rule_json, seed_rule_json, aggregate_config_json,
         registration_opens_at, registration_cutoff, allow_late_registration,
         multi_registration, auto_pull_json
       ) VALUES ($1,$2,$3,$4,FALSE,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        newSlug,
        newName,
        source.short_description ?? null,
        source.long_description,
        source.registration_mode,
        source.allowed_team_sizes,
        source.combined_leaderboard,
        source.variant_rule_json ?? null,
        source.seed_rule_json ?? null,
        source.aggregate_config_json ?? null,
        source.registration_opens_at ?? null,
        source.registration_cutoff ?? null,
        source.allow_late_registration,
        source.multi_registration,
        source.auto_pull_json ?? null,
      ],
    );
    const event = result.rows[0];
    await client.query(
      `INSERT INTO event_admins (event_id, user_id, role, granted_by) VALUES ($1, $2, 'OWNER', NULL)`,
      [event.id, createdBy],
    );
    await client.query('COMMIT');
    const row = event as EventWithStagesRow;
    row.stages = [];
    return formatEvent(row);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) return 'slug_taken';
    throw err;
  } finally {
    client.release();
  }
}
