import type { Sql } from 'postgres';
import type {
  TicketComment,
  TicketPinState,
  TicketSubscriptionState,
  TicketVoteState,
} from '@tracker/types';

/** Inserts a comment and returns its id. */
export async function insertComment(
  sql: Sql,
  ticketId: string,
  authorId: number,
  body: string,
  isInternal: boolean,
): Promise<{ id: string }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal)
    VALUES (${ticketId}, ${authorId}, ${body}, ${isInternal})
    RETURNING id
  `;
  const row = rows[0];
  if (!row) throw new Error('insertComment: no row returned');
  return { id: row.id };
}

interface CommentRow {
  id: string;
  ticket_id: string;
  author_display_name: string;
  author_color_hex: string | null;
  author_text_color: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Lists comments on a ticket.
 * Internal comments are only returned when includeInternal is true.
 */
export async function listComments(
  sql: Sql,
  ticketId: string,
  includeInternal: boolean,
): Promise<TicketComment[]> {
  const rows = await sql<CommentRow[]>`
    SELECT
      c.id,
      c.ticket_id,
      u.display_name  AS author_display_name,
      u.color_hex     AS author_color_hex,
      u.text_color    AS author_text_color,
      c.body,
      c.is_internal,
      c.created_at::TEXT AS created_at,
      c.updated_at::TEXT AS updated_at
    FROM ticket_comments c
    JOIN public.users  u  ON u.id = c.author_id
    WHERE c.ticket_id = ${ticketId}
      AND (${includeInternal} OR NOT c.is_internal)
    ORDER BY c.created_at ASC
  `;
  return rows;
}

interface VoteRow {
  vote_count: string;
  user_has_voted: boolean;
}

/** Returns the vote count and whether the given user has voted. Pass null for unauthenticated callers. */
export async function getVoteState(
  sql: Sql,
  ticketId: string,
  userId: number | null,
): Promise<TicketVoteState> {
  const [row] = await sql<VoteRow[]>`
    SELECT
      COUNT(*)::TEXT AS vote_count,
      COALESCE(BOOL_OR(user_id = ${userId}), false) AS user_has_voted
    FROM ticket_votes
    WHERE ticket_id = ${ticketId}
  `;
  return {
    ticket_id: ticketId,
    vote_count: parseInt(row?.vote_count ?? '0', 10),
    user_has_voted: row?.user_has_voted ?? false,
  };
}

/** Adds a vote. Returns false if the user has already voted (idempotent). */
export async function addVote(
  sql: Sql,
  ticketId: string,
  userId: number,
): Promise<{ inserted: boolean }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ticket_votes (ticket_id, user_id)
    VALUES (${ticketId}, ${userId})
    ON CONFLICT (ticket_id, user_id) DO NOTHING
    RETURNING ticket_id
  `;
  return { inserted: rows.length > 0 };
}

// ── Pins ──────────────────────────────────────────────────────────────────────

/** Returns whether the given user has pinned the ticket. Pass null for unauthenticated callers. */
export async function getPinState(
  sql: Sql,
  ticketId: string,
  userId: number | null,
): Promise<TicketPinState> {
  if (!userId) return { ticket_id: ticketId, is_pinned: false };
  const rows = await sql<{ ticket_id: string }[]>`
    SELECT ticket_id FROM ticket_pins
    WHERE ticket_id = ${ticketId} AND user_id = ${userId}
  `;
  return { ticket_id: ticketId, is_pinned: rows.length > 0 };
}

/** Pins a ticket for the given user (idempotent). */
export async function addPin(sql: Sql, ticketId: string, userId: number): Promise<void> {
  await sql`
    INSERT INTO ticket_pins (ticket_id, user_id)
    VALUES (${ticketId}, ${userId})
    ON CONFLICT (ticket_id, user_id) DO NOTHING
  `;
}

/** Unpins a ticket for the given user. */
export async function removePin(sql: Sql, ticketId: string, userId: number): Promise<void> {
  await sql`DELETE FROM ticket_pins WHERE ticket_id = ${ticketId} AND user_id = ${userId}`;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

/** Returns whether the given user is subscribed to the ticket. Pass null for unauthenticated callers. */
export async function getSubscriptionState(
  sql: Sql,
  ticketId: string,
  userId: number | null,
): Promise<TicketSubscriptionState> {
  if (!userId) return { ticket_id: ticketId, is_subscribed: false };
  const rows = await sql<{ ticket_id: string }[]>`
    SELECT ticket_id FROM ticket_subscriptions
    WHERE ticket_id = ${ticketId} AND user_id = ${userId}
  `;
  return { ticket_id: ticketId, is_subscribed: rows.length > 0 };
}

/** Subscribes a user to a ticket (idempotent). */
export async function subscribeToTicket(sql: Sql, ticketId: string, userId: number): Promise<void> {
  await sql`
    INSERT INTO ticket_subscriptions (ticket_id, user_id)
    VALUES (${ticketId}, ${userId})
    ON CONFLICT (ticket_id, user_id) DO NOTHING
  `;
}

/** Unsubscribes a user from a ticket. */
export async function unsubscribeFromTicket(
  sql: Sql,
  ticketId: string,
  userId: number,
): Promise<void> {
  await sql`
    DELETE FROM ticket_subscriptions WHERE ticket_id = ${ticketId} AND user_id = ${userId}
  `;
}

/** Removes a vote. Returns false if the user had not voted. */
export async function removeVote(
  sql: Sql,
  ticketId: string,
  userId: number,
): Promise<{ deleted: boolean }> {
  const rows = await sql<{ ticket_id: string }[]>`
    DELETE FROM ticket_votes
    WHERE ticket_id = ${ticketId} AND user_id = ${userId}
    RETURNING ticket_id
  `;
  return { deleted: rows.length > 0 };
}
