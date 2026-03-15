import { pool } from '../../config/db';

export type FilterType = 'ALL' | 'TOP_N' | 'THRESHOLD' | 'MANUAL';
export type SeedingMethod = 'RANKED' | 'RANDOM' | 'MANUAL';

export type StageRelationshipRow = {
  id: number;
  source_stage_id: number;
  target_stage_id: number;
  filter_type: FilterType;
  filter_value: number | null;
  seeding_method: SeedingMethod;
  created_at: Date;
};

export type CreateRelationshipBody = {
  source_stage_id: number;
  target_stage_id: number;
  filter_type: FilterType;
  filter_value?: number | null;
  seeding_method?: SeedingMethod;
};

export type UpdateRelationshipBody = {
  filter_type?: FilterType;
  filter_value?: number | null;
  seeding_method?: SeedingMethod;
};

export async function listStageRelationships(eventId: number): Promise<StageRelationshipRow[]> {
  const result = await pool.query<StageRelationshipRow>(
    `SELECT esr.*
     FROM event_stage_relationships esr
     JOIN event_stages es ON es.id = esr.source_stage_id
     WHERE es.event_id = $1
     ORDER BY esr.id`,
    [eventId],
  );
  return result.rows;
}

// Returns null if either stage doesn't belong to eventId.
export async function createStageRelationship(
  eventId: number,
  body: CreateRelationshipBody,
): Promise<StageRelationshipRow | 'cross_event' | 'duplicate'> {
  // Validate both stages belong to this event
  const stagesCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_stages
     WHERE id IN ($1, $2) AND event_id = $3`,
    [body.source_stage_id, body.target_stage_id, eventId],
  );
  if (parseInt(stagesCheck.rows[0].count, 10) < 2) return 'cross_event';

  try {
    const result = await pool.query<StageRelationshipRow>(
      `INSERT INTO event_stage_relationships
         (source_stage_id, target_stage_id, filter_type, filter_value, seeding_method)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        body.source_stage_id,
        body.target_stage_id,
        body.filter_type,
        body.filter_value ?? null,
        body.seeding_method ?? 'RANKED',
      ],
    );
    return result.rows[0];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) return 'duplicate';
    throw err;
  }
}

export async function updateStageRelationship(
  eventId: number,
  relationshipId: number,
  body: UpdateRelationshipBody,
): Promise<StageRelationshipRow | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(body, 'filter_type')) {
    fields.push(`filter_type = $${values.length + 1}`);
    values.push(body.filter_type);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'filter_value')) {
    fields.push(`filter_value = $${values.length + 1}`);
    values.push(body.filter_value ?? null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'seeding_method')) {
    fields.push(`seeding_method = $${values.length + 1}`);
    values.push(body.seeding_method);
  }

  if (fields.length > 0) {
    // Verify the relationship belongs to this event
    values.push(relationshipId, eventId);
    const result = await pool.query(
      `UPDATE event_stage_relationships esr
       SET ${fields.join(', ')}
       FROM event_stages es
       WHERE esr.id = $${values.length - 1}
         AND esr.source_stage_id = es.id
         AND es.event_id = $${values.length}
       RETURNING esr.id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
  }

  // Re-fetch with event check
  const result = await pool.query<StageRelationshipRow>(
    `SELECT esr.*
     FROM event_stage_relationships esr
     JOIN event_stages es ON es.id = esr.source_stage_id
     WHERE esr.id = $1 AND es.event_id = $2`,
    [relationshipId, eventId],
  );
  return result.rows[0] ?? null;
}

export async function deleteStageRelationship(
  eventId: number,
  relationshipId: number,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM event_stage_relationships esr
     USING event_stages es
     WHERE esr.id = $1
       AND esr.source_stage_id = es.id
       AND es.event_id = $2`,
    [relationshipId, eventId],
  );
  return (result.rowCount ?? 0) > 0;
}
