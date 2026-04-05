import type { Sql } from 'postgres';
import type { UserNotification, NotificationEventType } from '@tracker/types';

/**
 * Inserts a notification_events row, then fans out user_notifications to all
 * ticket subscribers excluding the actor.
 *
 * Called by the notification service — do not call directly from routes.
 */
export async function recordNotificationEvent(
  sql: Sql,
  ticketId: string,
  actorId: number,
  eventType: NotificationEventType,
): Promise<void> {
  await sql`
    WITH event AS (
      INSERT INTO notification_events (ticket_id, actor_id, event_type)
      VALUES (${ticketId}, ${actorId}, ${eventType})
      RETURNING id
    )
    INSERT INTO user_notifications (user_id, event_id)
    SELECT ts.user_id, event.id
    FROM ticket_subscriptions ts
    CROSS JOIN event
    WHERE ts.ticket_id = ${ticketId}
      AND ts.user_id  <> ${actorId}
    ON CONFLICT (user_id, event_id) DO NOTHING
  `;
}

interface NotificationRow {
  id: string;
  ticket_id: string;
  ticket_title: string;
  event_type: NotificationEventType;
  actor_display_name: string;
  is_read: boolean;
  created_at: string;
}

/** Returns all notifications for a user, newest first. */
export async function listUserNotifications(
  sql: Sql,
  userId: number,
): Promise<{ notifications: UserNotification[]; unread_count: number }> {
  const rows = await sql<NotificationRow[]>`
    SELECT
      un.id,
      ne.ticket_id,
      t.title        AS ticket_title,
      ne.event_type,
      u.display_name AS actor_display_name,
      un.is_read,
      un.created_at::TEXT AS created_at
    FROM user_notifications un
    JOIN notification_events ne ON ne.id   = un.event_id
    JOIN tickets              t  ON t.id   = ne.ticket_id
    JOIN users                u  ON u.id   = ne.actor_id
    WHERE un.user_id = ${userId}
    ORDER BY un.created_at DESC
  `;

  const unread_count = rows.filter((r) => !r.is_read).length;
  return { notifications: rows, unread_count };
}

/** Marks a notification as read. Returns true if the notification belonged to the user. */
export async function markNotificationRead(
  sql: Sql,
  notificationId: string,
  userId: number,
): Promise<boolean> {
  const rows = await sql<{ id: string }[]>`
    UPDATE user_notifications
    SET is_read = TRUE
    WHERE id = ${notificationId} AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}
