import { pool } from '../../config/db';

export type OptInRow = {
  id: number;
  stage_id: number;
  user_id: number;
  partner_user_id: number | null;
  created_at: Date;
};

export type OptInResponse = OptInRow & {
  display_name: string;
  partner_display_name: string | null;
  /** true when partner_user_id is set AND they have a matching opt-in pointing back at this user */
  partner_confirmed: boolean;
};

// ---------------------------------------------------------------------------
// Internal helper — attach display names + mutual-confirmation flag
// ---------------------------------------------------------------------------

async function enrichOptIns(rows: OptInRow[]): Promise<OptInResponse[]> {
  if (rows.length === 0) return [];

  // Collect all user IDs we need names for
  const userIds = new Set<number>();
  for (const r of rows) {
    userIds.add(r.user_id);
    if (r.partner_user_id !== null) userIds.add(r.partner_user_id);
  }

  const namesResult = await pool.query<{ id: number; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id = ANY($1)`,
    [Array.from(userIds)],
  );
  const nameMap = new Map(namesResult.rows.map((u) => [u.id, u.display_name]));

  // Build a set of (user_id, partner_user_id) pairs that exist in this batch for quick mutual check.
  // But we also need to query pairs not in the current batch — query DB once for all relevant partners.
  const stageIds = [...new Set(rows.map((r) => r.stage_id))];
  const partnerIds = rows.map((r) => r.partner_user_id).filter((id) => id !== null) as number[];

  const mutualPairs = new Set<string>();
  if (partnerIds.length > 0) {
    const mutualResult = await pool.query<{ user_id: number; partner_user_id: number }>(
      `SELECT user_id, partner_user_id FROM event_stage_opt_ins
       WHERE stage_id = ANY($1) AND user_id = ANY($2)`,
      [stageIds, partnerIds],
    );
    for (const m of mutualResult.rows) {
      if (m.partner_user_id !== null) {
        mutualPairs.add(`${m.user_id}:${m.partner_user_id}`);
      }
    }
  }

  return rows.map((r) => {
    const partnerConfirmed =
      r.partner_user_id !== null && mutualPairs.has(`${r.partner_user_id}:${r.user_id}`);

    return {
      ...r,
      display_name: nameMap.get(r.user_id) ?? '',
      partner_display_name:
        r.partner_user_id !== null ? (nameMap.get(r.partner_user_id) ?? null) : null,
      partner_confirmed: partnerConfirmed,
    };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listOptIns(stageId: number): Promise<OptInResponse[]> {
  const result = await pool.query<OptInRow>(
    `SELECT * FROM event_stage_opt_ins WHERE stage_id = $1 ORDER BY created_at`,
    [stageId],
  );
  return enrichOptIns(result.rows);
}

export async function getMyOptIn(stageId: number, userId: number): Promise<OptInResponse | null> {
  const result = await pool.query<OptInRow>(
    `SELECT * FROM event_stage_opt_ins WHERE stage_id = $1 AND user_id = $2`,
    [stageId, userId],
  );
  if (result.rowCount === 0) return null;
  const enriched = await enrichOptIns(result.rows);
  return enriched[0];
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateOptInResult =
  | { ok: true; optIn: OptInResponse }
  | {
      ok: false;
      reason:
        | 'not_registered'
        | 'partner_not_registered'
        | 'already_opted_in'
        | 'wrong_stage_policy';
    };

export async function createOptIn(
  stageId: number,
  eventId: number,
  userId: number,
  partnerUserId: number | null,
): Promise<CreateOptInResult> {
  // Stage must have QUEUED team policy
  const stageCheck = await pool.query<{ team_policy: string }>(
    `SELECT team_policy FROM event_stages WHERE id = $1`,
    [stageId],
  );
  if (stageCheck.rowCount === 0 || stageCheck.rows[0].team_policy !== 'QUEUED') {
    return { ok: false, reason: 'wrong_stage_policy' };
  }

  // Caller must be registered for this event
  const regCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_registrations
     WHERE event_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
    [eventId, userId],
  );
  if (parseInt(regCheck.rows[0].count, 10) === 0) {
    return { ok: false, reason: 'not_registered' };
  }

  // Partner (if provided) must also be registered
  if (partnerUserId !== null) {
    const partnerRegCheck = await pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM event_registrations
       WHERE event_id = $1 AND user_id = $2 AND status = 'ACTIVE'`,
      [eventId, partnerUserId],
    );
    if (parseInt(partnerRegCheck.rows[0].count, 10) === 0) {
      return { ok: false, reason: 'partner_not_registered' };
    }
  }

  // Insert — UNIQUE (stage_id, user_id) will throw on duplicate
  let insertResult;
  try {
    insertResult = await pool.query<OptInRow>(
      `INSERT INTO event_stage_opt_ins (stage_id, user_id, partner_user_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [stageId, userId, partnerUserId],
    );
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    ) {
      return { ok: false, reason: 'already_opted_in' };
    }
    throw err;
  }

  const enriched = await enrichOptIns(insertResult.rows);
  return { ok: true, optIn: enriched[0] };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export type DeleteOptInResult = { ok: true } | { ok: false; reason: 'not_found' };

export async function deleteOptIn(stageId: number, userId: number): Promise<DeleteOptInResult> {
  const result = await pool.query(
    `DELETE FROM event_stage_opt_ins WHERE stage_id = $1 AND user_id = $2`,
    [stageId, userId],
  );
  if ((result.rowCount ?? 0) === 0) {
    return { ok: false, reason: 'not_found' };
  }
  return { ok: true };
}
