import { PoolClient } from 'pg';
import { pool } from '../../config/db';

type DbClient = PoolClient | typeof pool;

export type EligibilityStatus = 'ENROLLED' | 'INELIGIBLE' | 'COMPLETED';

export interface EventPlayerEligibility {
  event_id: number;
  user_id: number;
  team_size: number;
  status: EligibilityStatus;
  source_event_team_id: number | null;
  status_reason: string | null;
  changed_at: string;
  created_at: string;
  display_name?: string;
}

function getDb(client?: PoolClient): DbClient {
  return client ?? pool;
}

export async function upsertEnrolledIfMissing(input: {
  eventId: number;
  teamSize: number;
  userId: number;
  sourceEventTeamId?: number | null;
  client?: PoolClient;
}): Promise<EventPlayerEligibility> {
  const { eventId, teamSize, userId, sourceEventTeamId, client } = input;
  const db = getDb(client);

  const result = await db.query<EventPlayerEligibility>(
    `
    INSERT INTO event_player_eligibilities (
      event_id,
      user_id,
      team_size,
      status,
      source_event_team_id,
      status_reason,
      changed_at
    )
    VALUES ($1, $2, $3, 'ENROLLED', $4, 'registered', NOW())
    ON CONFLICT (event_id, user_id, team_size)
    DO NOTHING
    RETURNING *;
    `,
    [eventId, userId, teamSize, sourceEventTeamId ?? null],
  );

  // If row already existed, return the existing state
  if (result.rowCount > 0) {
    return result.rows[0];
  }

  const existing = await db.query<EventPlayerEligibility>(
    `
    SELECT *
    FROM event_player_eligibilities
    WHERE event_id = $1 AND user_id = $2 AND team_size = $3
    `,
    [eventId, userId, teamSize],
  );

  return existing.rows[0] as EventPlayerEligibility;
}

export async function markIneligible(input: {
  eventId: number;
  teamSize: number;
  userId: number;
  reason?: string | null;
  sourceEventTeamId?: number | null;
  client?: PoolClient;
}): Promise<EventPlayerEligibility> {
  const { eventId, teamSize, userId, reason, sourceEventTeamId, client } = input;
  const db = getDb(client);
  const sanitizedReason =
    reason && reason.length > 255 ? reason.slice(0, 255) : (reason ?? 'spoiler_view');

  const result = await db.query<EventPlayerEligibility>(
    `
    INSERT INTO event_player_eligibilities (
      event_id,
      user_id,
      team_size,
      status,
      source_event_team_id,
      status_reason,
      changed_at
    )
    VALUES ($1, $2, $3, 'INELIGIBLE', $4, $5, NOW())
    ON CONFLICT (event_id, user_id, team_size)
    DO UPDATE SET
      status = EXCLUDED.status,
      source_event_team_id = COALESCE(event_player_eligibilities.source_event_team_id, EXCLUDED.source_event_team_id),
      status_reason = COALESCE(event_player_eligibilities.status_reason, EXCLUDED.status_reason),
      changed_at = NOW()
    RETURNING *;
    `,
    [eventId, userId, teamSize, sourceEventTeamId ?? null, sanitizedReason],
  );

  return result.rows[0];
}

export async function markCompleted(input: {
  eventId: number;
  teamSize: number;
  userId: number;
  reason?: string | null;
  client?: PoolClient;
}): Promise<EventPlayerEligibility> {
  const { eventId, teamSize, userId, reason, client } = input;
  const db = getDb(client);
  const sanitizedReason =
    reason && reason.length > 255 ? reason.slice(0, 255) : (reason ?? 'completed');

  const result = await db.query<EventPlayerEligibility>(
    `
    INSERT INTO event_player_eligibilities (
      event_id,
      user_id,
      team_size,
      status,
      status_reason,
      changed_at
    )
    VALUES ($1, $2, $3, 'COMPLETED', $4, NOW())
    ON CONFLICT (event_id, user_id, team_size)
    DO UPDATE SET
      status = EXCLUDED.status,
      status_reason = COALESCE(event_player_eligibilities.status_reason, EXCLUDED.status_reason),
      changed_at = NOW()
    RETURNING *;
    `,
    [eventId, userId, teamSize, sanitizedReason],
  );

  return result.rows[0];
}

export async function findEligibilityForUsers(input: {
  eventId: number;
  teamSize: number;
  userIds: number[];
  client?: PoolClient;
}): Promise<EventPlayerEligibility[]> {
  const { eventId, teamSize, userIds, client } = input;
  if (userIds.length === 0) return [];

  const db = getDb(client);
  const result = await db.query<EventPlayerEligibility>(
    `
    SELECT
      epe.*,
      u.display_name
    FROM event_player_eligibilities epe
    JOIN users u ON u.id = epe.user_id
    WHERE epe.event_id = $1
      AND epe.team_size = $2
      AND epe.user_id = ANY($3::int[])
    `,
    [eventId, teamSize, userIds],
  );

  return result.rows;
}

export async function listEligibilityForUser(input: {
  eventId: number;
  userId: number;
  teamSize?: number;
  client?: PoolClient;
}): Promise<EventPlayerEligibility[]> {
  const { eventId, userId, teamSize, client } = input;
  const db = getDb(client);

  const result = await db.query<EventPlayerEligibility>(
    `
    SELECT
      epe.*,
      u.display_name
    FROM event_player_eligibilities epe
    JOIN users u ON u.id = epe.user_id
    WHERE epe.event_id = $1
      AND epe.user_id = $2
      AND ($3::int IS NULL OR epe.team_size = $3::int)
    ORDER BY epe.team_size;
    `,
    [eventId, userId, teamSize ?? null],
  );

  return result.rows;
}

export async function listEligibilityForEvent(input: {
  eventId: number;
  userId: number;
  client?: PoolClient;
}): Promise<EventPlayerEligibility[]> {
  const { eventId, userId, client } = input;
  return listEligibilityForUser({ eventId, userId, client });
}

export function hasBlockingStatus(
  entries: EventPlayerEligibility[],
  status: EligibilityStatus,
): boolean {
  return entries.some((e) => e.status === status);
}

export function allAreStatuses(
  entries: EventPlayerEligibility[],
  allowed: EligibilityStatus[],
): boolean {
  return entries.length > 0 && entries.every((e) => allowed.includes(e.status));
}
