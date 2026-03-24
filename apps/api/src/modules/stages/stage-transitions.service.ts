import { pool } from '../../config/db';

export type FilterType = 'ALL' | 'TOP_N' | 'THRESHOLD' | 'MANUAL';
export type SeedingMethod = 'PRESERVE' | 'RANKED' | 'RANDOM' | 'MANUAL';
export type TeamAssignmentAlgorithm = 'RANDOM' | 'BALANCED' | 'MANUAL';

export type TeamAssignmentConfig = {
  algorithm: TeamAssignmentAlgorithm;
  team_size: number;
};

export type StageTransitionRow = {
  id: number;
  event_id: number;
  after_stage_id: number | null;
  after_group_id: number | null;
  filter_type: FilterType;
  filter_value: number | null;
  seeding_method: SeedingMethod;
  team_assignment_config: TeamAssignmentConfig | null;
  created_at: Date;
};

export type UpsertTransitionBody = {
  filter_type: FilterType;
  filter_value?: number | null;
  seeding_method?: SeedingMethod;
  team_assignment_config?: TeamAssignmentConfig | null;
};

export async function listStageTransitions(eventId: number): Promise<StageTransitionRow[]> {
  const result = await pool.query<StageTransitionRow>(
    `SELECT * FROM event_stage_transitions WHERE event_id = $1 ORDER BY id`,
    [eventId],
  );
  return result.rows;
}

// Upsert the transition that follows a specific stage.
// Returns 'not_found' if the stage doesn't belong to the event.
export async function upsertTransitionAfterStage(
  eventId: number,
  stageId: number,
  body: UpsertTransitionBody,
): Promise<StageTransitionRow | 'not_found'> {
  const check = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_stages WHERE id = $1 AND event_id = $2`,
    [stageId, eventId],
  );
  if (parseInt(check.rows[0].count, 10) === 0) return 'not_found';

  const result = await pool.query<StageTransitionRow>(
    `INSERT INTO event_stage_transitions
       (event_id, after_stage_id, filter_type, filter_value, seeding_method, team_assignment_config)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (after_stage_id) DO UPDATE SET
       filter_type            = EXCLUDED.filter_type,
       filter_value           = EXCLUDED.filter_value,
       seeding_method         = EXCLUDED.seeding_method,
       team_assignment_config = EXCLUDED.team_assignment_config
     RETURNING *`,
    [
      eventId,
      stageId,
      body.filter_type,
      body.filter_value ?? null,
      body.seeding_method ?? 'PRESERVE',
      body.team_assignment_config ?? null,
    ],
  );
  return result.rows[0];
}

// Upsert the transition that follows a specific group.
// Returns 'not_found' if the group doesn't belong to the event.
export async function upsertTransitionAfterGroup(
  eventId: number,
  groupId: number,
  body: UpsertTransitionBody,
): Promise<StageTransitionRow | 'not_found'> {
  const check = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_stage_groups WHERE id = $1 AND event_id = $2`,
    [groupId, eventId],
  );
  if (parseInt(check.rows[0].count, 10) === 0) return 'not_found';

  const result = await pool.query<StageTransitionRow>(
    `INSERT INTO event_stage_transitions
       (event_id, after_group_id, filter_type, filter_value, seeding_method, team_assignment_config)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (after_group_id) DO UPDATE SET
       filter_type            = EXCLUDED.filter_type,
       filter_value           = EXCLUDED.filter_value,
       seeding_method         = EXCLUDED.seeding_method,
       team_assignment_config = EXCLUDED.team_assignment_config
     RETURNING *`,
    [
      eventId,
      groupId,
      body.filter_type,
      body.filter_value ?? null,
      body.seeding_method ?? 'PRESERVE',
      body.team_assignment_config ?? null,
    ],
  );
  return result.rows[0];
}

export async function deleteStageTransition(
  eventId: number,
  transitionId: number,
): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM event_stage_transitions WHERE id = $1 AND event_id = $2`,
    [transitionId, eventId],
  );
  return (result.rowCount ?? 0) > 0;
}
