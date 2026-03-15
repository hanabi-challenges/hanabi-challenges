import { pool } from '../../config/db';

export type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'WITHDRAWN';

export type RegistrationRow = {
  id: number;
  event_id: number;
  user_id: number;
  display_name: string;
  status: RegistrationStatus;
  registered_at: Date;
};

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listRegistrations(eventId: number): Promise<RegistrationRow[]> {
  const result = await pool.query<RegistrationRow>(
    `SELECT er.id, er.event_id, er.user_id, u.display_name, er.status, er.registered_at
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = $1
     ORDER BY er.registered_at`,
    [eventId],
  );
  return result.rows;
}

export async function getRegistration(
  eventId: number,
  userId: number,
): Promise<RegistrationRow | null> {
  const result = await pool.query<RegistrationRow>(
    `SELECT er.id, er.event_id, er.user_id, u.display_name, er.status, er.registered_at
     FROM event_registrations er
     JOIN users u ON u.id = er.user_id
     WHERE er.event_id = $1 AND er.user_id = $2`,
    [eventId, userId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export type RegisterResult =
  | { ok: true; registration: RegistrationRow }
  | { ok: false; reason: 'cutoff_passed' };

export async function registerUser(
  eventId: number,
  userId: number,
  eventMeta: { registration_cutoff: Date | null; allow_late_registration: boolean },
): Promise<RegisterResult> {
  const now = new Date();

  if (
    eventMeta.registration_cutoff !== null &&
    now > eventMeta.registration_cutoff &&
    !eventMeta.allow_late_registration
  ) {
    return { ok: false, reason: 'cutoff_passed' };
  }

  // UPSERT: if previously withdrawn, reactivate; if already active/pending, leave as-is
  await pool.query(
    `INSERT INTO event_registrations (event_id, user_id, status)
     VALUES ($1, $2, 'ACTIVE')
     ON CONFLICT (event_id, user_id) DO UPDATE
       SET status = CASE
         WHEN event_registrations.status = 'WITHDRAWN' THEN 'ACTIVE'
         ELSE event_registrations.status
       END`,
    [eventId, userId],
  );

  const full = await getRegistration(eventId, userId);
  return { ok: true, registration: full! };
}

// ---------------------------------------------------------------------------
// Withdraw (self)
// ---------------------------------------------------------------------------

export type WithdrawResult =
  | { ok: true; registration: RegistrationRow; warning?: string }
  | { ok: false; reason: 'not_registered' | 'stage_results_exist' };

export async function withdrawRegistration(
  eventId: number,
  userId: number,
): Promise<WithdrawResult> {
  const reg = await getRegistration(eventId, userId);
  if (!reg || reg.status === 'WITHDRAWN') {
    return { ok: false, reason: 'not_registered' };
  }

  // Block withdrawal if STAGE-scoped team results exist
  const stageResultCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_game_results egr
     JOIN event_teams et ON et.id = egr.event_team_id
     JOIN event_team_members etm ON etm.event_team_id = et.id
     WHERE etm.user_id = $1 AND et.event_id = $2 AND et.stage_id IS NOT NULL`,
    [userId, eventId],
  );
  if (parseInt(stageResultCheck.rows[0].count, 10) > 0) {
    return { ok: false, reason: 'stage_results_exist' };
  }

  // Warn if EVENT-scoped team results exist (but still allow withdrawal)
  const eventResultCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM event_game_results egr
     JOIN event_teams et ON et.id = egr.event_team_id
     JOIN event_team_members etm ON etm.event_team_id = et.id
     WHERE etm.user_id = $1 AND et.event_id = $2 AND et.stage_id IS NULL`,
    [userId, eventId],
  );
  const hasEventResults = parseInt(eventResultCheck.rows[0].count, 10) > 0;

  await pool.query(
    `UPDATE event_registrations SET status = 'WITHDRAWN' WHERE event_id = $1 AND user_id = $2`,
    [eventId, userId],
  );

  const updated = await getRegistration(eventId, userId);
  if (hasEventResults) {
    return {
      ok: true,
      registration: updated!,
      warning: 'Withdrawal recorded; event-scoped team results for this user still exist',
    };
  }
  return { ok: true, registration: updated! };
}

// ---------------------------------------------------------------------------
// Admin status update
// ---------------------------------------------------------------------------

export type AdminUpdateResult =
  | { ok: true; registration: RegistrationRow }
  | { ok: false; reason: 'not_found' | 'invalid_status' };

const VALID_ADMIN_STATUSES: RegistrationStatus[] = ['PENDING', 'ACTIVE', 'WITHDRAWN'];

export async function adminUpdateRegistration(
  eventId: number,
  userId: number,
  newStatus: RegistrationStatus,
): Promise<AdminUpdateResult> {
  if (!VALID_ADMIN_STATUSES.includes(newStatus)) {
    return { ok: false, reason: 'invalid_status' };
  }

  const result = await pool.query(
    `UPDATE event_registrations SET status = $1
     WHERE event_id = $2 AND user_id = $3
     RETURNING id`,
    [newStatus, eventId, userId],
  );
  if ((result.rowCount ?? 0) === 0) {
    return { ok: false, reason: 'not_found' };
  }

  const updated = await getRegistration(eventId, userId);
  return { ok: true, registration: updated! };
}
