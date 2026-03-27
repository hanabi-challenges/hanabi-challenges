import type { Sql } from 'postgres';

/**
 * Logs a Discord outbound webhook delivery attempt.
 *
 * Delivery failures are recorded here but never affect ticket state.
 * event_id is nullable for dispatches not tied to a notification event.
 */
export async function logDiscordDelivery(
  sql: Sql,
  opts: {
    eventId: string | null;
    status: 'success' | 'failure';
    httpStatus?: number;
    error?: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO discord_delivery_log (event_id, status, http_status, error)
    VALUES (${opts.eventId}, ${opts.status}, ${opts.httpStatus ?? null}, ${opts.error ?? null})
  `;
}
