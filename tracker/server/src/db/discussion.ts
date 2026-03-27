import type { Sql } from 'postgres';
import type { TicketComment, TicketVoteState } from '@tracker/types';

/** Inserts a comment and returns its id. */
export async function insertComment(
  sql: Sql,
  ticketId: string,
  authorId: string,
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
      u.display_name AS author_display_name,
      c.body,
      c.is_internal,
      c.created_at::TEXT AS created_at,
      c.updated_at::TEXT AS updated_at
    FROM ticket_comments c
    JOIN users u ON u.id = c.author_id
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

/** Returns the vote count and whether the given user has voted. */
export async function getVoteState(
  sql: Sql,
  ticketId: string,
  userId: string,
): Promise<TicketVoteState> {
  const [row] = await sql<VoteRow[]>`
    SELECT
      COUNT(*)::TEXT AS vote_count,
      BOOL_OR(user_id = ${userId}) AS user_has_voted
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
  userId: string,
): Promise<{ inserted: boolean }> {
  const rows = await sql<{ id: string }[]>`
    INSERT INTO ticket_votes (ticket_id, user_id)
    VALUES (${ticketId}, ${userId})
    ON CONFLICT (ticket_id, user_id) DO NOTHING
    RETURNING ticket_id
  `;
  return { inserted: rows.length > 0 };
}

/** Removes a vote. Returns false if the user had not voted. */
export async function removeVote(
  sql: Sql,
  ticketId: string,
  userId: string,
): Promise<{ deleted: boolean }> {
  const rows = await sql<{ ticket_id: string }[]>`
    DELETE FROM ticket_votes
    WHERE ticket_id = ${ticketId} AND user_id = ${userId}
    RETURNING ticket_id
  `;
  return { deleted: rows.length > 0 };
}
