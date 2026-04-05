import type { Sql } from 'postgres';
import type {
  TicketTypeSlug,
  DomainSlug,
  StatusSlug,
  BugSeverity,
  BugReproducibility,
  TicketSummary,
  TicketDetail,
  TicketHistoryEntry,
  StatusHistoryEntry,
  MetadataHistoryEntry,
  MetadataChanges,
  UpdateTicketMetadataRequest,
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
  submittedBy: number,
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
  description: string;
  type_slug: TicketTypeSlug;
  domain_slug: DomainSlug;
  status_slug: StatusSlug;
  is_terminal: boolean;
  submitted_by_display_name: string;
  submitted_by_color_hex: string | null;
  submitted_by_text_color: string | null;
  vote_count: number;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

interface TicketDetailRow extends TicketSummaryRow {
  severity: BugSeverity | null;
  reproducibility: BugReproducibility | null;
}

/** Returns a paginated list of tickets. Pinned tickets sort first when userId is provided. */
export async function listTickets(
  sql: Sql,
  opts: {
    limit: number;
    offset: number;
    status_slug?: string;
    type_slug?: string;
    domain_slug?: string;
    userId?: number | null;
  },
): Promise<{ tickets: TicketSummary[]; total: number }> {
  const statusFilter = opts.status_slug ? sql`AND s.slug = ${opts.status_slug}` : sql``;
  const typeFilter = opts.type_slug ? sql`AND tt.slug = ${opts.type_slug}` : sql``;
  const domainFilter = opts.domain_slug ? sql`AND d.slug = ${opts.domain_slug}` : sql``;

  const [countRow] = await sql<{ count: string }[]>`
    SELECT COUNT(*)::TEXT AS count
    FROM tickets t
    JOIN ticket_types tt ON tt.id = t.type_id
    JOIN domains       d  ON d.id  = t.domain_id
    JOIN statuses      s  ON s.id  = t.current_status_id
    WHERE t.deleted_at IS NULL ${statusFilter} ${typeFilter} ${domainFilter}
  `;
  const total = parseInt(countRow?.count ?? '0', 10);

  const pinJoin = opts.userId
    ? sql`LEFT JOIN ticket_pins tp ON tp.ticket_id = t.id AND tp.user_id = ${opts.userId}`
    : sql``;
  const pinOrder = opts.userId ? sql`(tp.user_id IS NOT NULL) DESC,` : sql``;

  const rows = await sql<TicketSummaryRow[]>`
    SELECT
      t.id,
      t.title,
      t.description,
      tt.slug        AS type_slug,
      d.slug         AS domain_slug,
      s.slug         AS status_slug,
      s.is_terminal,
      u.display_name AS submitted_by_display_name,
      u.color_hex    AS submitted_by_color_hex,
      u.text_color   AS submitted_by_text_color,
      (SELECT COUNT(*)::INTEGER FROM ticket_votes tv WHERE tv.ticket_id = t.id) AS vote_count,
      (SELECT COUNT(*)::INTEGER FROM ticket_comments tc WHERE tc.ticket_id = t.id AND NOT tc.is_internal) AS comment_count,
      t.created_at::TEXT AS created_at,
      t.updated_at::TEXT AS updated_at
    FROM tickets t
    JOIN ticket_types  tt ON tt.id = t.type_id
    JOIN domains       d  ON d.id  = t.domain_id
    JOIN statuses      s  ON s.id  = t.current_status_id
    JOIN public.users  u  ON u.id  = t.submitted_by
    ${pinJoin}
    WHERE t.deleted_at IS NULL ${statusFilter} ${typeFilter} ${domainFilter}
    ORDER BY ${pinOrder} t.created_at DESC
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
      u.color_hex    AS submitted_by_color_hex,
      u.text_color   AS submitted_by_text_color,
      (SELECT COUNT(*)::INTEGER FROM ticket_votes tv WHERE tv.ticket_id = t.id) AS vote_count,
      (SELECT COUNT(*)::INTEGER FROM ticket_comments tc WHERE tc.ticket_id = t.id AND NOT tc.is_internal) AS comment_count,
      t.severity,
      t.reproducibility,
      t.created_at::TEXT AS created_at,
      t.updated_at::TEXT AS updated_at
    FROM tickets t
    JOIN ticket_types  tt ON tt.id = t.type_id
    JOIN domains       d  ON d.id  = t.domain_id
    JOIN statuses      s  ON s.id  = t.current_status_id
    JOIN public.users  u  ON u.id  = t.submitted_by
    WHERE t.id = ${id}
      AND t.deleted_at IS NULL
  `;
  return rows[0] ?? null;
}

/** Soft-deletes a ticket by setting deleted_at. No-op if already deleted. */
export async function softDeleteTicket(sql: Sql, ticketId: string): Promise<void> {
  await sql`
    UPDATE tickets SET deleted_at = now(), updated_at = now()
    WHERE id = ${ticketId} AND deleted_at IS NULL
  `;
}

/** Looks up a ticket_type id by slug. Throws if not found. */
async function getTypeId(sql: Sql, slug: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM ticket_types WHERE slug = ${slug}`;
  const row = rows[0];
  if (!row) throw new Error(`getTypeId: no ticket_type with slug '${slug}'`);
  return row.id;
}

/** Looks up a domain id by slug. Throws if not found. */
async function getDomainId(sql: Sql, slug: string): Promise<number> {
  const rows = await sql<{ id: number }[]>`SELECT id FROM domains WHERE slug = ${slug}`;
  const row = rows[0];
  if (!row) throw new Error(`getDomainId: no domain with slug '${slug}'`);
  return row.id;
}

/**
 * Updates editable metadata fields on a ticket and writes a metadata history record.
 * Only fields present in the input are updated; unchanged fields are left as-is.
 * Returns the updated ticket, or null if the ticket does not exist or is deleted.
 */
export async function updateTicketMetadata(
  sql: Sql,
  ticketId: string,
  input: UpdateTicketMetadataRequest,
  changedBy: number,
): Promise<TicketDetail | null> {
  const current = await getTicketById(sql, ticketId);
  if (!current) return null;

  // Compute which fields are actually changing
  const changes: MetadataChanges = {};
  if (input.type_slug !== undefined && input.type_slug !== current.type_slug) {
    changes.type = { from: current.type_slug, to: input.type_slug };
  }
  if (input.domain_slug !== undefined && input.domain_slug !== current.domain_slug) {
    changes.domain = { from: current.domain_slug, to: input.domain_slug };
  }
  if (input.severity !== undefined && input.severity !== current.severity) {
    changes.severity = { from: current.severity, to: input.severity ?? null };
  }
  if (input.reproducibility !== undefined && input.reproducibility !== current.reproducibility) {
    changes.reproducibility = { from: current.reproducibility, to: input.reproducibility ?? null };
  }

  if (Object.keys(changes).length === 0) return current;

  // Resolve IDs for changed slug fields
  const newTypeId =
    changes.type !== undefined ? await getTypeId(sql, input.type_slug as string) : null;
  const newDomainId =
    changes.domain !== undefined ? await getDomainId(sql, input.domain_slug as string) : null;

  // Use a CTE to perform the UPDATE + INSERT atomically in one round-trip.
  const changesJson = JSON.stringify(changes);
  await sql`
    WITH updated AS (
      UPDATE tickets SET
        type_id         = COALESCE(${newTypeId}, type_id),
        domain_id       = COALESCE(${newDomainId}, domain_id),
        severity        = ${changes.severity !== undefined ? (input.severity ?? null) : sql`severity`},
        reproducibility = ${changes.reproducibility !== undefined ? (input.reproducibility ?? null) : sql`reproducibility`},
        updated_at      = now()
      WHERE id = ${ticketId}
      RETURNING id
    )
    INSERT INTO ticket_metadata_history (ticket_id, changed_by, changes)
    SELECT ${ticketId}, ${changedBy}, ${changesJson}::jsonb
    FROM updated
  `;

  return getTicketById(sql, ticketId);
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
    JOIN public.users u  ON u.id  = t.submitted_by
    WHERE s.is_terminal = FALSE
      AND t.search_vector @@ websearch_to_tsquery('english', ${q})
    ORDER BY ts_rank(t.search_vector, websearch_to_tsquery('english', ${q})) DESC
    LIMIT ${SEARCH_RESULT_LIMIT}
  `;
  return { ok: true, tickets };
}

/** Returns the merged status + metadata history for a ticket, oldest first. */
export async function getTicketHistory(sql: Sql, ticketId: string): Promise<TicketHistoryEntry[]> {
  const [statusRows, metadataRows] = await Promise.all([
    sql<Omit<StatusHistoryEntry, 'kind'>[]>`
      SELECT
        h.id,
        s_from.slug    AS from_status_slug,
        s_to.slug      AS to_status_slug,
        u.display_name AS changed_by_display_name,
        u.color_hex    AS changed_by_color_hex,
        u.text_color   AS changed_by_text_color,
        h.resolution_note,
        h.created_at::TEXT AS created_at
      FROM ticket_status_history h
      LEFT JOIN statuses     s_from ON s_from.id = h.from_status_id
      JOIN      statuses     s_to   ON s_to.id   = h.to_status_id
      LEFT JOIN public.users u      ON u.id       = h.changed_by
      WHERE h.ticket_id = ${ticketId}
    `,
    sql<Omit<MetadataHistoryEntry, 'kind'>[]>`
      SELECT
        m.id,
        u.display_name AS changed_by_display_name,
        u.color_hex    AS changed_by_color_hex,
        u.text_color   AS changed_by_text_color,
        m.changes,
        m.created_at::TEXT AS created_at
      FROM ticket_metadata_history m
      JOIN public.users u ON u.id = m.changed_by
      WHERE m.ticket_id = ${ticketId}
    `,
  ]);

  const merged: TicketHistoryEntry[] = [
    ...statusRows.map((r) => ({ kind: 'status' as const, ...r })),
    ...metadataRows.map((r) => ({ kind: 'metadata' as const, ...r })),
  ];
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return merged;
}
