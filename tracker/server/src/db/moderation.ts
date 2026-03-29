import type { Sql } from 'postgres';
import type { TicketSummary } from '@tracker/types';

/** Flag a ticket ready for committee review. Overwrites any existing flag. */
export async function flagTicketForReview(
  sql: Sql,
  ticketId: string,
  flaggedById: string,
): Promise<void> {
  await sql`
    UPDATE tickets
    SET ready_for_review_at = now(),
        flagged_by           = ${flaggedById}
    WHERE id = ${ticketId}
  `;
}

/** Clear the ready-for-review flag on a ticket. No-op if not set. */
export async function clearReviewFlag(sql: Sql, ticketId: string): Promise<void> {
  await sql`
    UPDATE tickets
    SET ready_for_review_at = NULL,
        flagged_by           = NULL
    WHERE id = ${ticketId}
  `;
}

/** Mark a ticket as a duplicate and close it. */
export async function closeAsDuplicate(
  sql: Sql,
  ticketId: string,
  canonicalTicketId: string,
  closedStatusId: number,
  changedById: string,
): Promise<void> {
  await sql`
    WITH updated AS (
      UPDATE tickets
      SET current_status_id = ${closedStatusId},
          duplicate_of      = ${canonicalTicketId},
          updated_at        = now()
      WHERE id   = ${ticketId}
        AND id  <> ${canonicalTicketId}
      RETURNING id
    )
    INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by, resolution_note)
    SELECT
      t.id,
      t.current_status_id,
      ${closedStatusId},
      ${changedById},
      'Closed as duplicate of ' || ${canonicalTicketId}
    FROM tickets t
    JOIN updated ON t.id = updated.id
  `;
}

/** Return the canonical ticket id that this ticket is a duplicate of, or null. */
export async function getDuplicateOf(sql: Sql, ticketId: string): Promise<string | null> {
  const rows = await sql<{ duplicate_of: string | null }[]>`
    SELECT duplicate_of FROM tickets WHERE id = ${ticketId}
  `;
  return rows[0]?.duplicate_of ?? null;
}

/** Return all tickets flagged ready_for_review_at IS NOT NULL, ordered oldest flag first. */
export async function listReadyForReviewTickets(sql: Sql): Promise<TicketSummary[]> {
  return sql<TicketSummary[]>`
    SELECT
      t.id,
      t.title,
      tt.slug AS type_slug,
      d.slug  AS domain_slug,
      s.slug  AS status_slug,
      s.is_terminal,
      u.display_name AS submitted_by_display_name,
      t.created_at,
      t.updated_at
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains      d  ON d.id  = t.domain_id
    JOIN statuses     s  ON s.id  = t.current_status_id
    JOIN users        u  ON u.id  = t.submitted_by
    WHERE t.ready_for_review_at IS NOT NULL
    ORDER BY t.ready_for_review_at ASC
  `;
}

/** Return open (non-terminal) tickets ordered by vote count descending. */
export async function getPlanningSignal(
  sql: Sql,
  typeId?: number,
  domainId?: number,
): Promise<(TicketSummary & { vote_count: number })[]> {
  return sql<(TicketSummary & { vote_count: number })[]>`
    SELECT
      t.id,
      t.title,
      tt.slug AS type_slug,
      d.slug  AS domain_slug,
      s.slug  AS status_slug,
      s.is_terminal,
      u.display_name AS submitted_by_display_name,
      t.created_at,
      t.updated_at,
      COUNT(tv.user_id)::int AS vote_count
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains      d  ON d.id  = t.domain_id
    JOIN statuses     s  ON s.id  = t.current_status_id
    JOIN users        u  ON u.id  = t.submitted_by
    LEFT JOIN ticket_votes tv ON tv.ticket_id = t.id
    WHERE s.is_terminal = FALSE
      ${typeId !== undefined ? sql`AND t.type_id = ${typeId}` : sql``}
      ${domainId !== undefined ? sql`AND t.domain_id = ${domainId}` : sql``}
    GROUP BY t.id, tt.slug, d.slug, s.slug, s.is_terminal, u.display_name
    ORDER BY vote_count DESC, t.created_at ASC
  `;
}
