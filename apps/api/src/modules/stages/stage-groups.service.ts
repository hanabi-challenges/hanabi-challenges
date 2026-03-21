import { pool } from '../../config/db';
import { createStage, getStage } from './stages.service';
import { bulkAddGameSlots } from './games.service';
import type {
  StageResponse,
  StageMechanism,
  ParticipationType,
  TeamScope,
  AttemptPolicy,
  TimePolicy,
} from './stages.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GroupTemplate = {
  label_pattern?: string;
  mechanism?: string;
  participation_type?: string;
  team_scope?: string;
  attempt_policy?: string;
  time_policy?: string;
  game_count?: number;
  variant_rule_json?: Record<string, unknown> | null;
  seed_rule_json?: Record<string, unknown> | null;
};

export type StageGroupRow = {
  id: number;
  event_id: number;
  label: string;
  group_index: number;
  scoring_config_json: Record<string, unknown>;
  template_json: GroupTemplate | null;
  visible: boolean;
  created_at: Date;
};

export type StageGroupResponse = StageGroupRow & {
  stage_count: number;
};

export type CreateGroupBody = {
  label: string;
  scoring_config_json?: Record<string, unknown>;
  template_json?: GroupTemplate | null;
  visible?: boolean;
};

export type UpdateGroupBody = Partial<CreateGroupBody>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StageGroupRowWithCount = StageGroupRow & { stage_count: string };

function formatGroup(row: StageGroupRowWithCount): StageGroupResponse {
  return { ...row, stage_count: parseInt(row.stage_count, 10) };
}

const GROUP_SELECT = `
  SELECT g.*,
    (SELECT COUNT(*) FROM event_stages s WHERE s.group_id = g.id)::text AS stage_count
  FROM event_stage_groups g
`;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listStageGroups(eventId: number): Promise<StageGroupResponse[]> {
  const result = await pool.query<StageGroupRowWithCount>(
    `${GROUP_SELECT} WHERE g.event_id = $1 ORDER BY g.group_index`,
    [eventId],
  );
  return result.rows.map(formatGroup);
}

export async function getStageGroup(
  eventId: number,
  groupId: number,
): Promise<StageGroupResponse | null> {
  const result = await pool.query<StageGroupRowWithCount>(
    `${GROUP_SELECT} WHERE g.id = $1 AND g.event_id = $2`,
    [groupId, eventId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return formatGroup(result.rows[0]);
}

export async function createStageGroup(
  eventId: number,
  body: CreateGroupBody,
): Promise<StageGroupResponse> {
  const indexResult = await pool.query<{ next_index: number }>(
    `SELECT COALESCE(MAX(group_index), -1) + 1 AS next_index FROM event_stage_groups WHERE event_id = $1`,
    [eventId],
  );
  const groupIndex = indexResult.rows[0].next_index;

  const result = await pool.query<StageGroupRow>(
    `INSERT INTO event_stage_groups (event_id, label, group_index, scoring_config_json, template_json, visible)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      eventId,
      body.label,
      groupIndex,
      JSON.stringify(body.scoring_config_json ?? {}),
      body.template_json != null ? JSON.stringify(body.template_json) : null,
      body.visible ?? true,
    ],
  );
  return (await getStageGroup(eventId, result.rows[0].id))!;
}

export async function updateStageGroup(
  eventId: number,
  groupId: number,
  body: UpdateGroupBody,
): Promise<StageGroupResponse | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    fields.push(`label = $${values.length + 1}`);
    values.push(body.label);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'scoring_config_json')) {
    fields.push(`scoring_config_json = $${values.length + 1}`);
    values.push(JSON.stringify(body.scoring_config_json ?? {}));
  }
  if (Object.prototype.hasOwnProperty.call(body, 'template_json')) {
    fields.push(`template_json = $${values.length + 1}`);
    values.push(body.template_json != null ? JSON.stringify(body.template_json) : null);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'visible')) {
    fields.push(`visible = $${values.length + 1}`);
    values.push(body.visible ?? true);
  }

  if (fields.length > 0) {
    values.push(groupId, eventId);
    const result = await pool.query(
      `UPDATE event_stage_groups SET ${fields.join(', ')}
       WHERE id = $${values.length - 1} AND event_id = $${values.length}
       RETURNING id`,
      values,
    );
    if ((result.rowCount ?? 0) === 0) return null;
  }

  return getStageGroup(eventId, groupId);
}

// Reorder: moves groupId to newIndex, shifting other groups to make room.
export async function reorderStageGroup(
  eventId: number,
  groupId: number,
  newIndex: number,
): Promise<StageGroupResponse | null> {
  const groupResult = await pool.query<{ group_index: number }>(
    `SELECT group_index FROM event_stage_groups WHERE id = $1 AND event_id = $2`,
    [groupId, eventId],
  );
  if ((groupResult.rowCount ?? 0) === 0) return null;

  const oldIndex = groupResult.rows[0].group_index;
  if (oldIndex === newIndex) return getStageGroup(eventId, groupId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`UPDATE event_stage_groups SET group_index = $1 WHERE id = $2`, [
      -groupId,
      groupId,
    ]);

    if (oldIndex < newIndex) {
      await client.query(
        `UPDATE event_stage_groups
         SET group_index = group_index - 1
         WHERE event_id = $1 AND group_index > $2 AND group_index <= $3`,
        [eventId, oldIndex, newIndex],
      );
    } else {
      await client.query(
        `UPDATE event_stage_groups
         SET group_index = group_index + 1
         WHERE event_id = $1 AND group_index >= $2 AND group_index < $3`,
        [eventId, newIndex, oldIndex],
      );
    }

    await client.query(`UPDATE event_stage_groups SET group_index = $1 WHERE id = $2`, [
      newIndex,
      groupId,
    ]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return getStageGroup(eventId, groupId);
}

// Returns 'has_stages' if any stage still belongs to this group.
export async function deleteStageGroup(
  eventId: number,
  groupId: number,
): Promise<boolean | 'has_stages'> {
  const stageCheck = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_stages WHERE group_id = $1`,
    [groupId],
  );
  if (parseInt(stageCheck.rows[0].count, 10) > 0) return 'has_stages';

  const result = await pool.query(
    `DELETE FROM event_stage_groups WHERE id = $1 AND event_id = $2`,
    [groupId, eventId],
  );
  return (result.rowCount ?? 0) > 0;
}

// Assign a stage to a group (groupId=null to ungroup).
// Returns null if the stage or group is not found / cross-event.
export async function assignStageToGroup(
  eventId: number,
  stageId: number,
  groupId: number | null,
): Promise<StageResponse | null> {
  if (groupId !== null) {
    const groupCheck = await pool.query<{ id: number }>(
      `SELECT id FROM event_stage_groups WHERE id = $1 AND event_id = $2`,
      [groupId, eventId],
    );
    if ((groupCheck.rowCount ?? 0) === 0) return null;
  }

  const result = await pool.query(
    `UPDATE event_stages SET group_id = $1 WHERE id = $2 AND event_id = $3 RETURNING id`,
    [groupId, stageId, eventId],
  );
  if ((result.rowCount ?? 0) === 0) return null;
  return getStage(eventId, stageId);
}

// ---------------------------------------------------------------------------
// Scaffold — bulk-create stages from the group's template
// ---------------------------------------------------------------------------

function resolveLabel(pattern: string | undefined, n: number): string {
  if (!pattern) return `Stage ${n}`;
  return pattern.replace(/\{n\}/g, String(n));
}

export async function scaffoldGroupStages(
  eventId: number,
  groupId: number,
  count: number,
  firstStartsAt?: string | null,
  stageDurationDays?: number | null,
): Promise<StageResponse[]> {
  const group = await getStageGroup(eventId, groupId);
  if (!group) throw new Error('Group not found');

  const template = group.template_json;
  if (!template?.mechanism) {
    throw new Error('Group template must specify a mechanism before scaffolding');
  }

  // Count existing stages in group to compute {n} correctly
  const countResult = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM event_stages WHERE group_id = $1`,
    [groupId],
  );
  const existingInGroup = parseInt(countResult.rows[0].count, 10);

  const created: StageResponse[] = [];

  for (let i = 0; i < count; i++) {
    const n = existingInGroup + i + 1;
    const label = resolveLabel(template.label_pattern, n);

    let startsAt: string | null = null;
    let endsAt: string | null = null;

    if (firstStartsAt && stageDurationDays && stageDurationDays > 0) {
      const start = new Date(firstStartsAt);
      start.setUTCDate(start.getUTCDate() + i * stageDurationDays);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + stageDurationDays);
      startsAt = start.toISOString();
      endsAt = end.toISOString();
    } else if (firstStartsAt && i === 0) {
      startsAt = firstStartsAt;
    }

    const stage = await createStage(eventId, {
      label,
      mechanism: template.mechanism as StageMechanism,
      participation_type: (template.participation_type as ParticipationType) ?? 'TEAM',
      team_scope: (template.team_scope as TeamScope) ?? 'EVENT',
      attempt_policy: (template.attempt_policy as AttemptPolicy) ?? 'SINGLE',
      time_policy: (template.time_policy as TimePolicy) ?? 'WINDOW',
      variant_rule_json: template.variant_rule_json ?? null,
      seed_rule_json: template.seed_rule_json ?? null,
      starts_at: startsAt,
      ends_at: endsAt,
    });

    // Assign to group
    await pool.query(`UPDATE event_stages SET group_id = $1 WHERE id = $2`, [groupId, stage.id]);

    // Add game slots if specified
    if (template.game_count && template.game_count > 0) {
      await bulkAddGameSlots(stage.id, template.game_count);
    }

    // Refetch to get accurate game_slot_count and group_id
    const final = await getStage(eventId, stage.id);
    if (final) created.push(final);
  }

  return created;
}
