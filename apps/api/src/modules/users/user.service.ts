import { pool } from '../../config/db';

export interface UserBadge {
  id: number;
  event_badge_id: number;
  event_id: number;
  event_name: string;
  event_slug: string;
  team_id: number | null;
  team_name: string | null;
  team_size: number;
  name: string;
  description: string;
  icon: string;
  rank: '1' | '2' | '3' | 'completion' | 'participation';
  awarded_at: string | null;
}

export async function getUserIdByDisplayName(displayName: string): Promise<number | null> {
  const result = await pool.query(
    `
    SELECT id
    FROM users
    WHERE display_name = $1
    LIMIT 1;
    `,
    [displayName],
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0].id as number;
}

export interface UserAward {
  id: number;
  award_id: number;
  event_id: number;
  event_name: string;
  event_slug: string;
  stage_id: number | null;
  stage_label: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: string;
  granted_at: string;
}

export async function listUserAwards(userId: number): Promise<UserAward[]> {
  const result = await pool.query(
    `
    SELECT
      eag.id,
      eag.award_id,
      ea.event_id,
      ev.name AS event_name,
      ev.slug AS event_slug,
      ea.stage_id,
      es.label AS stage_label,
      ea.name,
      ea.description,
      ea.icon,
      ea.criteria_type,
      eag.granted_at
    FROM event_award_grants eag
    JOIN event_awards ea ON eag.award_id = ea.id
    JOIN events ev ON ea.event_id = ev.id
    LEFT JOIN event_stages es ON ea.stage_id = es.id
    WHERE eag.user_id = $1
    ORDER BY eag.granted_at DESC, eag.id DESC;
    `,
    [userId],
  );

  return result.rows as UserAward[];
}

export async function listUserBadges(userId: number): Promise<UserBadge[]> {
  const result = await pool.query(
    `
    SELECT
      eba.id,
      eba.event_badge_id,
      eb.event_id,
      ev.name AS event_name,
      ev.slug AS event_slug,
      eba.team_id,
      et.name AS team_name,
      eb.team_size,
      eb.name,
      eb.description,
      eb.icon,
      eb.rank,
      eba.awarded_at
    FROM event_badge_awards eba
    JOIN event_badges eb ON eba.event_badge_id = eb.id
    JOIN events ev ON eb.event_id = ev.id
    LEFT JOIN event_teams et ON eba.team_id = et.id
    WHERE eba.user_id = $1
    ORDER BY eba.awarded_at DESC NULLS LAST, ev.starts_at DESC NULLS LAST, eba.id DESC;
    `,
    [userId],
  );

  return result.rows as UserBadge[];
}
