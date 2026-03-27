import type { Sql } from 'postgres';
import type {
  TicketTypeSlug,
  DomainSlug,
  StatusSlug,
  BugSeverity,
  BugReproducibility,
  TicketSummary,
  TicketDetail,
} from '@tracker/types';

export interface CreateTicketInput {
  title: string;
  description: string;
  type_id: number;
  domain_id: number;
  severity?: BugSeverity;
  reproducibility?: BugReproducibility;
}

export interface TicketRow {
  id: string;
  current_status_id: number;
}

/** Inserts a ticket row and returns id + current_status_id. */
export async function insertTicket(
  sql: Sql,
  submittedBy: string,
  currentStatusId: number,
  input: CreateTicketInput,
): Promise<TicketRow> {
  const rows = await sql<TicketRow[]>`
    INSERT INTO tickets (title, description, type_id, domain_id, submitted_by, current_status_id, severity, reproducibility)
    VALUES (
      ${input.title},
      ${input.description},
      ${input.type_id},
      ${input.domain_id},
      ${submittedBy},
      ${currentStatusId},
      ${input.severity ?? null},
      ${input.reproducibility ?? null}
    )
    RETURNING id, current_status_id
  `;
  const row = rows[0];
  if (!row) throw new Error('insertTicket: no row returned');
  return row;
}

interface TicketSummaryRow {
  id: string;
  title: string;
  type_slug: TicketTypeSlug;
  domain_slug: DomainSlug;
  status_slug: StatusSlug;
  is_terminal: boolean;
  submitted_by_display_name: string;
  created_at: string;
  updated_at: string;
}

interface TicketDetailRow extends TicketSummaryRow {
  description: string;
  severity: BugSeverity | null;
  reproducibility: BugReproducibility | null;
}

/** Returns a paginated list of tickets ordered by newest first. */
export async function listTickets(
  sql: Sql,
  opts: { limit: number; offset: number },
): Promise<{ tickets: TicketSummary[]; total: number }> {
  const [countRow] = await sql<{ count: string }[]>`SELECT COUNT(*)::TEXT AS count FROM tickets`;
  const total = parseInt(countRow?.count ?? '0', 10);

  const rows = await sql<TicketSummaryRow[]>`
    SELECT
      t.id,
      t.title,
      tt.slug        AS type_slug,
      d.slug         AS domain_slug,
      s.slug         AS status_slug,
      s.is_terminal,
      u.display_name AS submitted_by_display_name,
      t.created_at::TEXT AS created_at,
      t.updated_at::TEXT AS updated_at
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains       d  ON d.id  = t.domain_id
    JOIN statuses      s  ON s.id  = t.current_status_id
    JOIN users         u  ON u.id  = t.submitted_by
    ORDER BY t.created_at DESC
    LIMIT  ${opts.limit}
    OFFSET ${opts.offset}
  `;

  return { tickets: rows, total };
}

/** Returns a single ticket with full detail, or null if not found. */
export async function getTicketById(sql: Sql, id: string): Promise<TicketDetail | null> {
  const rows = await sql<TicketDetailRow[]>`
    SELECT
      t.id,
      t.title,
      t.description,
      tt.slug        AS type_slug,
      d.slug         AS domain_slug,
      s.slug         AS status_slug,
      s.is_terminal,
      u.display_name AS submitted_by_display_name,
      t.severity,
      t.reproducibility,
      t.created_at::TEXT AS created_at,
      t.updated_at::TEXT AS updated_at
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains       d  ON d.id  = t.domain_id
    JOIN statuses      s  ON s.id  = t.current_status_id
    JOIN users         u  ON u.id  = t.submitted_by
    WHERE t.id = ${id}
  `;
  return rows[0] ?? null;
}

/** Looks up a status id by slug. Throws if not found. */
export async function getStatusId(sql: Sql, slug: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM statuses WHERE slug = ${slug}`;
  const row = rows[0];
  if (!row) throw new Error(`getStatusId: no status with slug '${slug}'`);
  return row.id;
}

const SEARCH_QUERY_MAX_LENGTH = 500;
const SEARCH_RESULT_LIMIT = 5;

/** Full-text ticket search using websearch_to_tsquery. Excludes terminal-status tickets. */
export async function searchTickets(
  sql: Sql,
  query: string,
): Promise<{ ok: true; tickets: TicketSummary[] } | { ok: false; reason: string }> {
  const q = query.trim();
  if (!q) return { ok: false, reason: 'query_empty' };
  if (q.length > SEARCH_QUERY_MAX_LENGTH) return { ok: false, reason: 'query_too_long' };

  const tickets = await sql<TicketSummary[]>`
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
    WHERE s.is_terminal = FALSE
      AND t.search_vector @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank(t.search_vector, websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `;
  return { ok: true, tickets };
}
