import { pool } from '../../config/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CriteriaType = 'RANK_POSITION' | 'SCORE_THRESHOLD' | 'PARTICIPATION' | 'MANUAL';
export type Attribution = 'INDIVIDUAL' | 'TEAM';

export type AwardRow = {
  id: number;
  event_id: number;
  stage_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: CriteriaType;
  criteria_value: Record<string, unknown> | null;
  attribution: Attribution;
  team_size: number | null;
  sort_order: number;
  created_at: Date;
};

export type GroupedAwardsResponse = {
  event_awards: AwardRow[];
  stage_awards: { stage_id: number; stage_label: string; awards: AwardRow[] }[];
};

export type CreateAwardBody = {
  stage_id?: number | null;
  name: string;
  description?: string | null;
  icon?: string | null;
  criteria_type: string;
  criteria_value?: Record<string, unknown> | null;
  attribution?: string;
  team_size?: number | null;
  sort_order?: number;
};

export type UpdateAwardBody = Partial<Omit<CreateAwardBody, 'stage_id'>>;

// ---------------------------------------------------------------------------
// Criteria value validation (exported for use in route layer)
// ---------------------------------------------------------------------------

export function validateCriteriaValue(
  type: CriteriaType,
  value: Record<string, unknown> | null | undefined,
): string | null {
  if (type === 'RANK_POSITION') {
    if (!value || !Array.isArray(value.positions) || (value.positions as unknown[]).length === 0) {
      return 'RANK_POSITION requires criteria_value.positions (non-empty array)';
    }
    return null;
  }
  if (type === 'SCORE_THRESHOLD') {
    if (!value) return 'SCORE_THRESHOLD requires criteria_value';
    const hasPct = typeof value.min_percentage === 'number';
    const hasScore = typeof value.min_score === 'number';
    if (!hasPct && !hasScore) {
      return 'SCORE_THRESHOLD requires criteria_value.min_percentage or criteria_value.min_score';
    }
    return null;
  }
  if (type === 'PARTICIPATION') {
    if (!value || typeof value.min_stages !== 'number') {
      return 'PARTICIPATION requires criteria_value.min_stages (number)';
    }
    return null;
  }
  // MANUAL: criteria_value is optional
  return null;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listAwards(eventId: number): Promise<GroupedAwardsResponse> {
  const awardsResult = await pool.query<AwardRow>(
    `SELECT * FROM event_awards WHERE event_id = $1 ORDER BY stage_id NULLS FIRST, sort_order, id`,
    [eventId],
  );

  // Fetch labels for stages referenced by awards
  const stageIds = [
    ...new Set(
      awardsResult.rows.filter((r) => r.stage_id !== null).map((r) => r.stage_id as number),
    ),
  ];
  const stageLabels = new Map<number, string>();

  if (stageIds.length > 0) {
    const stagesResult = await pool.query<{ id: number; label: string }>(
      `SELECT id, label FROM event_stages WHERE id = ANY($1)`,
      [stageIds],
    );
    for (const s of stagesResult.rows) stageLabels.set(s.id, s.label);
  }

  const event_awards: AwardRow[] = [];
  const byStage = new Map<number, AwardRow[]>();

  for (const award of awardsResult.rows) {
    if (award.stage_id === null) {
      event_awards.push(award);
    } else {
      if (!byStage.has(award.stage_id)) byStage.set(award.stage_id, []);
      byStage.get(award.stage_id)!.push(award);
    }
  }

  const stage_awards = stageIds.map((sid) => ({
    stage_id: sid,
    stage_label: stageLabels.get(sid) ?? '',
    awards: byStage.get(sid) ?? [],
  }));

  return { event_awards, stage_awards };
}

export async function getAward(awardId: number, eventId: number): Promise<AwardRow | null> {
  const result = await pool.query<AwardRow>(
    `SELECT * FROM event_awards WHERE id = $1 AND event_id = $2`,
    [awardId, eventId],
  );
  return result.rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export type CreateAwardResult =
  | { ok: true; award: AwardRow }
  | { ok: false; reason: 'stage_not_in_event' };

export async function createAward(
  eventId: number,
  body: CreateAwardBody,
): Promise<CreateAwardResult> {
  if (body.stage_id != null) {
    const stageCheck = await pool.query<{ id: number }>(
      `SELECT id FROM event_stages WHERE id = $1 AND event_id = $2`,
      [body.stage_id, eventId],
    );
    if (stageCheck.rowCount === 0) return { ok: false, reason: 'stage_not_in_event' };
  }

  const maxResult = await pool.query<{ max: number | null }>(
    `SELECT MAX(sort_order) AS max FROM event_awards WHERE event_id = $1`,
    [eventId],
  );
  const sortOrder = body.sort_order ?? (maxResult.rows[0].max ?? -1) + 1;

  const result = await pool.query<AwardRow>(
    `INSERT INTO event_awards
       (event_id, stage_id, name, description, icon, criteria_type, criteria_value, attribution, team_size, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      eventId,
      body.stage_id ?? null,
      body.name,
      body.description ?? null,
      body.icon ?? null,
      body.criteria_type,
      body.criteria_value != null ? JSON.stringify(body.criteria_value) : null,
      body.attribution ?? 'INDIVIDUAL',
      body.team_size ?? null,
      sortOrder,
    ],
  );

  return { ok: true, award: result.rows[0] };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export type UpdateAwardResult = { ok: true; award: AwardRow } | { ok: false; reason: 'not_found' };

export async function updateAward(
  awardId: number,
  eventId: number,
  body: UpdateAwardBody,
): Promise<UpdateAwardResult> {
  const existing = await getAward(awardId, eventId);
  if (!existing) return { ok: false, reason: 'not_found' };

  const result = await pool.query<AwardRow>(
    `UPDATE event_awards SET
       name           = $1,
       description    = $2,
       icon           = $3,
       criteria_type  = $4,
       criteria_value = $5,
       attribution    = $6,
       team_size      = $7,
       sort_order     = $8
     WHERE id = $9
     RETURNING *`,
    [
      body.name ?? existing.name,
      body.description !== undefined ? body.description : existing.description,
      body.icon !== undefined ? body.icon : existing.icon,
      body.criteria_type ?? existing.criteria_type,
      body.criteria_value !== undefined
        ? body.criteria_value != null
          ? JSON.stringify(body.criteria_value)
          : null
        : existing.criteria_value != null
          ? JSON.stringify(existing.criteria_value)
          : null,
      body.attribution ?? existing.attribution,
      body.team_size !== undefined ? body.team_size : existing.team_size,
      body.sort_order ?? existing.sort_order,
      awardId,
    ],
  );

  return { ok: true, award: result.rows[0] };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export type DeleteAwardResult = 'ok' | 'not_found' | 'has_grants';

export async function deleteAward(awardId: number, eventId: number): Promise<DeleteAwardResult> {
  const existing = await getAward(awardId, eventId);
  if (!existing) return 'not_found';

  const grantsCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_award_grants WHERE award_id = $1`,
    [awardId],
  );
  if (parseInt(grantsCheck.rows[0].count, 10) > 0) return 'has_grants';

  await pool.query(`DELETE FROM event_awards WHERE id = $1`, [awardId]);
  return 'ok';
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export type ReorderEntry = { award_id: number; sort_order: number };

export type ReorderAwardsResult = { ok: true } | { ok: false; reason: 'award_not_in_event' };

export async function reorderAwards(
  eventId: number,
  entries: ReorderEntry[],
): Promise<ReorderAwardsResult> {
  if (entries.length === 0) return { ok: true };

  const ids = entries.map((e) => e.award_id);
  const checkResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_awards WHERE id = ANY($1) AND event_id = $2`,
    [ids, eventId],
  );
  if (parseInt(checkResult.rows[0].count, 10) !== ids.length) {
    return { ok: false, reason: 'award_not_in_event' };
  }

  await pool.query(
    `UPDATE event_awards ea
     SET sort_order = updates.sort_order
     FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS sort_order) AS updates
     WHERE ea.id = updates.id`,
    [ids, entries.map((e) => e.sort_order)],
  );

  return { ok: true };
}
