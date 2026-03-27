import type { Sql } from 'postgres';
import type { NotificationEventType } from '@tracker/types';
import { recordNotificationEvent } from '../db/notifications.js';

/**
 * Fans out a notification event to all ticket subscribers (excluding the actor).
 *
 * This is fire-and-continue — errors are logged but not propagated, so a
 * notification failure never blocks the primary operation.
 */
export async function fanoutNotification(
  sql: Sql,
  ticketId: string,
  actorId: string,
  eventType: NotificationEventType,
): Promise<void> {
  try {
    await recordNotificationEvent(sql, ticketId, actorId, eventType);
  } catch (err) {
    console.error({ ticketId, actorId, eventType, err }, 'Notification fanout failed');
  }
}
