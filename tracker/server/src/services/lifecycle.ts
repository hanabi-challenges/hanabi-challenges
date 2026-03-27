import type { Sql } from 'postgres';
import type { CreateTicketInput } from '../db/tickets.js';
import { getStatusId } from '../db/tickets.js';

/**
 * Submits a new ticket.
 *
 * This is the ONLY entry point for creating tickets. It:
 *   1. Resolves the 'submitted' status id
 *   2. Inserts the ticket row, initial status history, and subscription atomically
 *      via a single CTE (implicitly one transaction)
 *
 * Architecture invariant: no other code path may write to ticket_status_history
 * or update current_status_id on a ticket.
 */
export async function submitTicket(
  sql: Sql,
  submittedBy: string,
  input: CreateTicketInput,
): Promise<{ id: string }> {
  const submittedStatusId = await getStatusId(sql, 'submitted');

  const rows = await sql<{ id: string }[]>`
    WITH inserted AS (
      INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id, severity, reproducibility)
      VALUES (
        ${input.title},
        ${input.description},
        ${input.type_id},
        ${input.domain_id},
        ${submittedBy},
        ${submittedStatusId},
        ${input.severity ?? null},
        ${input.reproducibility ?? null}
      )
      RETURNING id
    ),
    history AS (
      INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by)
      SELECT id, NULL, ${submittedStatusId}, ${submittedBy} FROM inserted
    ),
    subscription AS (
      INSERT INTO ticket_subscriptions (ticket_id, user_id)
      SELECT id, ${submittedBy} FROM inserted
    )
    SELECT id FROM inserted
  `;

  const ticket = rows[0];
  if (!ticket) throw new Error('submitTicket: no row returned');
  return { id: ticket.id };
}

/**
 * Transitions a ticket to a new status.
 *
 * Validates that the transition is permitted for the given role before writing.
 * Records the history entry and updates current_status_id atomically via a CTE.
 *
 * Returns { ok: false } if the transition is not valid for this role/state.
 */
export async function transitionTicket(
  sql: Sql,
  ticketId: string,
  toStatusSlug: string,
  changedBy: string,
  roleSlug: string,
  resolutionNote?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  type CheckRow = {
    current_status_id: number;
    is_terminal: boolean;
    to_id: number | null;
    allowed: boolean;
  };

  // Read current state and validate in one query (no FOR UPDATE — acceptable at this scale)
  const [row] = await sql<CheckRow[]>`
    SELECT
      t.current_status_id,
      s_from.is_terminal,
      s_to.id AS to_id,
      EXISTS (
        SELECT 1 FROM valid_transitions vt
        JOIN roles r ON r.id = vt.role_id
        WHERE vt.from_status_id = t.current_status_id
          AND vt.to_status_id   = s_to.id
          AND r.name            = ${roleSlug}
      ) AS allowed
    FROM tickets t
    JOIN statuses s_from ON s_from.id = t.current_status_id
    LEFT JOIN statuses s_to ON s_to.slug = ${toStatusSlug}
    WHERE t.id = ${ticketId}
  `;

  if (!row) return { ok: false, reason: 'ticket_not_found' };
  if (row.is_terminal) return { ok: false, reason: 'already_terminal' };
  if (row.to_id === null) return { ok: false, reason: 'invalid_to_status' };
  if (!row.allowed) return { ok: false, reason: 'transition_not_allowed' };

  const toId = row.to_id;
  const fromId = row.current_status_id;

  // Apply update and history record in one CTE (atomic)
  await sql`
    WITH upd AS (
      UPDATE tickets SET current_status_id = ${toId}, updated_at = now()
      WHERE id = ${ticketId}
    )
    INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by, resolution_note)
    VALUES (${ticketId}, ${fromId}, ${toId}, ${changedBy}, ${resolutionNote ?? null})
  `;

  return { ok: true };
}
