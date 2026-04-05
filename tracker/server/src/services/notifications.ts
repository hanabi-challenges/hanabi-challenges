import type { Sql } from 'postgres';
import type { NotificationEventType } from '@tracker/types';
import { recordNotificationEvent } from '../db/notifications.js';
import { sendDiscordWebhook } from './discord.js';
import { logger } from '../logger.js';

/**
 * Fans out a notification event to all ticket subscribers (excluding the actor).
 *
 * This is fire-and-continue — errors are logged but not propagated, so a
 * notification failure never blocks the primary operation.
 */
export async function fanoutNotification(
  sql: Sql,
  ticketId: string,
  actorId: number | null,
  eventType: NotificationEventType,
): Promise<void> {
  if (actorId === null) return; // System-triggered events (e.g. GitHub Bot) have no actor to notify

  try {
    await recordNotificationEvent(sql, ticketId, actorId, eventType);
  } catch (err) {
    logger.error({ ticketId, actorId, eventType, err }, 'Notification fanout failed');
  }

  // Discord webhook fires after fanout; failures are handled inside sendDiscordWebhook
  void sendDiscordWebhook(sql, ticketId, actorId, eventType, null);
}
