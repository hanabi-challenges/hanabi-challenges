import type { Sql } from 'postgres';
import { env } from '../env.js';
import { logDiscordDelivery } from '../db/discord.js';

type DiscordEventType = 'status_changed' | 'comment_added';

/** Shape of the Discord webhook payload sent to the mod channel. */
interface WebhookPayload {
  content?: string;
  embeds: Array<{
    title: string;
    description: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    timestamp: string;
  }>;
}

function buildPayload(
  ticketId: string,
  ticketTitle: string,
  eventType: DiscordEventType,
  actorDisplayName: string,
  toStatusSlug?: string,
): WebhookPayload {
  const isStatusChange = eventType === 'status_changed';
  const description = isStatusChange
    ? `Status changed to **${toStatusSlug ?? 'unknown'}** by ${actorDisplayName}`
    : `New comment by ${actorDisplayName}`;

  return {
    embeds: [
      {
        title: ticketTitle,
        description,
        color: isStatusChange ? 0x5865f2 : 0x57f287,
        fields: [{ name: 'Ticket ID', value: ticketId, inline: true }],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Sends a Discord outbound webhook notification.
 *
 * Dormant when DISCORD_MOD_WEBHOOK_URL is not set — does nothing.
 * Always fire-and-forget: delivery failures are logged but never propagated.
 */
export async function sendDiscordWebhook(
  sql: Sql,
  ticketId: string,
  ticketTitle: string,
  actorDisplayName: string,
  eventType: DiscordEventType,
  eventId: string | null,
  toStatusSlug?: string,
): Promise<void> {
  const webhookUrl = env.DISCORD_MOD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = buildPayload(ticketId, ticketTitle, eventType, actorDisplayName, toStatusSlug);

  try {
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
