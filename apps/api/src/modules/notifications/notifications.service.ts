import { pool } from '../../config/db';

let notificationsSchemaEnsured = false;

export type UserNotification = {
  id: number;
  user_id: number;
  kind: 'badge_awarded';
  title: string;
  body: string;
  payload_json: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export async function ensureNotificationsSchema(): Promise<void> {
  if (notificationsSchemaEnsured) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('badge_awarded')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      read_at TIMESTAMPTZ NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created
      ON user_notifications (user_id, created_at DESC, id DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
      ON user_notifications (user_id, read_at)
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION notify_badge_award_insert()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $$
    DECLARE
      v_badge_name TEXT;
      v_badge_icon TEXT;
      v_badge_rank TEXT;
      v_event_name TEXT;
      v_event_slug TEXT;
      v_notification_id INTEGER;
    BEGIN
      SELECT
        eb.name,
        eb.icon,
        eb.rank,
        ev.name,
        ev.slug
      INTO
        v_badge_name,
        v_badge_icon,
        v_badge_rank,
        v_event_name,
        v_event_slug
      FROM event_badges eb
      JOIN events ev ON ev.id = eb.event_id
      WHERE eb.id = NEW.event_badge_id;

      IF v_badge_name IS NOT NULL THEN
        INSERT INTO user_notifications (
          user_id,
          kind,
          title,
          body,
          payload_json
        )
        VALUES (
          NEW.user_id,
          'badge_awarded',
          'Badge awarded',
          format('You earned "%s" in %s.', v_badge_name, v_event_name),
          jsonb_build_object(
            'event_badge_id', NEW.event_badge_id,
            'event_slug', v_event_slug,
            'event_name', v_event_name,
            'badge_name', v_badge_name,
            'badge_icon', v_badge_icon,
            'badge_rank', v_badge_rank
          )
        )
        RETURNING id INTO v_notification_id;

        PERFORM pg_notify(
          'user_notification',
          json_build_object(
            'user_id', NEW.user_id,
            'notification_id', v_notification_id,
            'kind', 'badge_awarded'
          )::text
        );
      END IF;

      RETURN NEW;
    END;
    $$;
  `);

  await pool.query(`DROP TRIGGER IF EXISTS trg_notify_badge_award_insert ON event_badge_awards`);
  await pool.query(`
    CREATE TRIGGER trg_notify_badge_award_insert
    AFTER INSERT ON event_badge_awards
    FOR EACH ROW
    EXECUTE FUNCTION notify_badge_award_insert()
  `);

  notificationsSchemaEnsured = true;
}

export async function listUserNotifications(
  userId: number,
  limit = 25,
): Promise<UserNotification[]> {
  await ensureNotificationsSchema();
  const safeLimit = Math.max(1, Math.min(100, limit));
  const result = await pool.query<UserNotification>(
    `
    SELECT
      id,
      user_id,
      kind,
      title,
      body,
      payload_json,
      read_at,
      created_at
    FROM user_notifications
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT $2
    `,
    [userId, safeLimit],
  );
  return result.rows;
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  await ensureNotificationsSchema();
  const result = await pool.query<{ count: string }>(
    `
    SELECT COUNT(*)::text AS count
    FROM user_notifications
    WHERE user_id = $1
      AND read_at IS NULL
    `,
    [userId],
  );
  return Number(result.rows[0]?.count ?? '0');
}

export async function markNotificationRead(
  userId: number,
  notificationId: number,
): Promise<boolean> {
  await ensureNotificationsSchema();
  const result = await pool.query(
    `
    UPDATE user_notifications
    SET read_at = COALESCE(read_at, NOW())
    WHERE id = $1
      AND user_id = $2
    `,
    [notificationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllNotificationsRead(userId: number): Promise<number> {
  await ensureNotificationsSchema();
  const result = await pool.query(
    `
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE user_id = $1
      AND read_at IS NULL
    `,
    [userId],
  );
  return result.rowCount ?? 0;
}
