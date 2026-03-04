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
