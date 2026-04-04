import type { Sql } from 'postgres';
import type { CreateTicketInput } from '../db/tickets.js';
import { getStatusId } from '../db/tickets.js';
import { fanoutNotification } from './notifications.js';
import { createGithubIssue } from './github.js';
import { getTicketByIssueNodeId } from '../db/github.js';
import { env } from '../env.js';
import { logger } from '../logger.js';

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
  submittedBy: number,
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

  // Fanout is fire-and-continue — notification failure does not fail the submission
  void fanoutNotification(sql, ticket.id, submittedBy, 'status_changed');

  logger.info({ ticketId: ticket.id, submittedBy }, 'ticket.submitted');
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
  changedBy: number,
  roleSlug: string,
  resolutionNote?: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  type CheckRow = {
    current_status_id: number;
    is_terminal: boolean;
    to_id: number | null;
    allowed: boolean;
    ticket_title: string;
    type_slug: string;
    domain_slug: string;
  };

  // Read current state and validate in one query (no FOR UPDATE — acceptable at this scale)
  const [row] = await sql<CheckRow[]>`
    SELECT
      t.current_status_id,
      t.title AS ticket_title,
      tt.slug AS type_slug,
      d.slug  AS domain_slug,
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
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains d       ON d.id  = t.domain_id
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
  const ticketTitle = row.ticket_title;

  // Apply update and history record in one CTE (atomic)
  await sql`
    WITH upd AS (
      UPDATE tickets SET current_status_id = ${toId}, updated_at = now()
      WHERE id = ${ticketId}
    )
    INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by, resolution_note)
    VALUES (${ticketId}, ${fromId}, ${toId}, ${changedBy}, ${resolutionNote ?? null})
  `;

  logger.info(
    { ticketId, fromStatusId: fromId, toStatusId: toId, changedBy, roleSlug },
    'ticket.transitioned',
  );

  void fanoutNotification(sql, ticketId, changedBy, 'status_changed');

  // Create a GitHub issue when a ticket moves to decided
  if (toStatusSlug === 'decided') {
    const base = env.TRACKER_BASE_URL ?? '';
    const trackerUrl = `${base}/tracker/tickets/${ticketId}`;
    void createGithubIssue(sql, ticketId, ticketTitle, trackerUrl, row.type_slug, row.domain_slug);
  }

  return { ok: true };
}

/**
 * Transitions a ticket triggered by a GitHub webhook event.
 *
 * Bypasses role/permission checks — caller is responsible for ensuring only
 * trusted GitHub events invoke this function. Uses the GitHub bot system user
 * as the actor in the status history.
 *
 * @param nodeId         The GitHub issue node_id stored in github_links.
 * @param toStatusSlug   Target status slug (e.g. 'in_progress', 'resolved').
 * @param fromStatusSlug Expected current status slug. If the ticket is not in
 *                       this state, the transition is skipped (idempotent).
 */
export async function transitionTicketFromGithub(
  sql: Sql,
  nodeId: string,
  toStatusSlug: string,
  fromStatusSlug: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const link = await getTicketByIssueNodeId(sql, nodeId);
  if (!link) return { ok: false, reason: 'no_linked_ticket' };
  if (link.is_terminal) return { ok: false, reason: 'already_terminal' };
  if (link.current_status_slug !== fromStatusSlug) {
    return { ok: false, reason: `unexpected_status:${link.current_status_slug}` };
  }

  type StatusRow = { id: number };
  const [toRow] = await sql<StatusRow[]>`SELECT id FROM statuses WHERE slug = ${toStatusSlug}`;
  if (!toRow) return { ok: false, reason: 'invalid_to_status' };

  type FromRow = { id: number };
  const [fromRow] = await sql<FromRow[]>`
    SELECT id FROM statuses WHERE slug = ${fromStatusSlug}
  `;
  if (!fromRow) return { ok: false, reason: 'invalid_from_status' };

  const ticketId = link.ticket_id;
  const toId = toRow.id;
  const fromId = fromRow.id;

  await sql`
    WITH upd AS (
      UPDATE tickets SET current_status_id = ${toId}, updated_at = now()
      WHERE id = ${ticketId}
    )
    INSERT INTO ticket_status_history (ticket_id, from_status_id, to_status_id, changed_by)
    VALUES (${ticketId}, ${fromId}, ${toId}, NULL)
  `;

  logger.info({ ticketId, fromStatusSlug, toStatusSlug, nodeId }, 'ticket.transitioned_by_github');

  void fanoutNotification(sql, ticketId, null, 'status_changed');

  return { ok: true };
}
