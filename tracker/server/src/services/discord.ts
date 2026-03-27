import type { Sql } from 'postgres';
import type { NotificationEventType } from '@tracker/types';
import { env } from '../env.js';
import { logDiscordDelivery } from '../db/discord.js';

/** Shape of the Discord webhook payload sent to the mod channel. */
interface WebhookPayload {
  embeds: Array<{
    title: string;
    description: string;
    color: number;
    fields: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

interface TicketActorInfo {
  ticket_title: string;
  actor_display_name: string;
  status_slug: string | null;
}

async function fetchTicketActorInfo(
  sql: Sql,
  ticketId: string,
  actorId: string,
): Promise<TicketActorInfo | null> {
  const [row] = await sql<TicketActorInfo[]>`
    SELECT
      t.title       AS ticket_title,
      u.display_name AS actor_display_name,
      s.slug        AS status_slug
    FROM tickets t
    JOIN statuses s ON s.id = t.current_status_id
    JOIN users    u ON u.id = ${actorId}
    WHERE t.id = ${ticketId}
  `;
  return row ?? null;
}

function buildPayload(info: TicketActorInfo, eventType: NotificationEventType): WebhookPayload {
  const isStatusChange = eventType === 'status_changed';
  const description = isStatusChange
    ? `Status changed to **${info.status_slug ?? 'unknown'}** by ${info.actor_display_name}`
    : `New comment by ${info.actor_display_name}`;

  return {
    embeds: [
      {
        title: info.ticket_title,
        description,
        color: isStatusChange ? 0x5865f2 : 0x57f287,
        fields: [
          { name: 'Ticket ID', value: `\`${info.ticket_title.slice(0, 40)}\``, inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Sends a Discord outbound webhook notification.
 *
 * Dormant when DISCORD_MOD_WEBHOOK_URL is not set — returns immediately.
 * Always fire-and-forget: delivery failures are logged but never propagated.
 */
export async function sendDiscordWebhook(
  sql: Sql,
  ticketId: string,
  actorId: string,
  eventType: NotificationEventType,
  eventId: string | null,
): Promise<void> {
  const webhookUrl = env.DISCORD_MOD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const info = await fetchTicketActorInfo(sql, ticketId, actorId);
    if (!info) return;

    const payload = buildPayload(info, eventType);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await logDiscordDelivery(sql, { eventId, status: 'success', httpStatus: response.status });
    } else {
      const errorText = await response.text().catch(() => '');
      await logDiscordDelivery(sql, {
        eventId,
        status: 'failure',
        httpStatus: response.status,
        error: errorText.slice(0, 500),
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await logDiscordDelivery(sql, { eventId, status: 'failure', error: error.slice(0, 500) }).catch(
      (logErr) => {
        console.error({ ticketId, eventType, logErr }, 'Failed to log Discord delivery failure');
      },
    );
    console.error({ ticketId, eventType, err }, 'Discord webhook dispatch failed');
  }
}
