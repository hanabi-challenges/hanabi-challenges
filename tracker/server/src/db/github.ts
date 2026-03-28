import type { Sql } from 'postgres';

export interface GithubLink {
  ticket_id: string;
  issue_number: number;
  issue_url: string;
  created_at: string;
}

export interface InboundWebhookLog {
  id: string;
  github_event: string;
  payload: unknown;
  status: 'pending' | 'processed' | 'ignored' | 'failed';
  error: string | null;
  received_at: string;
  processed_at: string | null;
}

export async function insertGithubLink(
  sql: Sql,
  ticketId: string,
  issueNumber: number,
  issueUrl: string,
): Promise<void> {
  await sql`
    INSERT INTO github_links (ticket_id, issue_number, issue_url)
    VALUES (${ticketId}, ${issueNumber}, ${issueUrl})
    ON CONFLICT (ticket_id) DO NOTHING
  `;
}

export async function insertInboundWebhookLog(
  sql: Sql,
  githubEvent: string,
  payload: unknown,
): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO inbound_webhook_log (github_event, payload)
    VALUES (${githubEvent}, ${sql.json(payload as never)})
    RETURNING id
  `;
  if (!row) throw new Error('insertInboundWebhookLog: no row returned');
  return row.id;
}

export async function getPendingWebhookLogs(sql: Sql): Promise<InboundWebhookLog[]> {
  return sql<InboundWebhookLog[]>`
    SELECT id, github_event, payload, status, error, received_at, processed_at
    FROM inbound_webhook_log
    WHERE status = 'pending'
    ORDER BY received_at
    LIMIT 50
  `;
}

export async function markWebhookLog(
  sql: Sql,
  id: string,
  status: 'processed' | 'ignored' | 'failed',
  error?: string,
): Promise<void> {
  await sql`
    UPDATE inbound_webhook_log
    SET status = ${status}, processed_at = now(), error = ${error ?? null}
    WHERE id = ${id}
  `;
}

export interface LinkedOpenTicket {
  ticket_id: string;
  ticket_title: string;
  status_slug: string;
  issue_number: number;
  issue_url: string;
}

export async function getLinkedOpenTickets(sql: Sql): Promise<LinkedOpenTicket[]> {
  return sql<LinkedOpenTicket[]>`
    SELECT
      gl.ticket_id,
      t.title AS ticket_title,
      s.slug  AS status_slug,
      gl.issue_number,
      gl.issue_url
    FROM github_links gl
    JOIN tickets  t ON t.id = gl.ticket_id
    JOIN statuses s ON s.id = t.current_status_id
    WHERE s.is_terminal = FALSE
    ORDER BY gl.created_at DESC
  `;
}

export interface FailedWebhook {
  id: string;
  github_event: string;
  error: string | null;
  received_at: string;
}

export async function getFailedWebhooks(sql: Sql): Promise<FailedWebhook[]> {
  return sql<FailedWebhook[]>`
    SELECT id, github_event, error, received_at
    FROM inbound_webhook_log
    WHERE status = 'failed'
    ORDER BY received_at DESC
    LIMIT 100
  `;
}

export interface TicketMissingLink {
  ticket_id: string;
  ticket_title: string;
  status_slug: string;
}

export async function getTicketsMissingGithubLink(sql: Sql): Promise<TicketMissingLink[]> {
  return sql<TicketMissingLink[]>`
    SELECT t.id AS ticket_id, t.title AS ticket_title, s.slug AS status_slug
    FROM tickets t
    JOIN statuses s ON s.id = t.current_status_id
    LEFT JOIN github_links gl ON gl.ticket_id = t.id
    WHERE s.slug = 'in_review'
      AND gl.ticket_id IS NULL
    ORDER BY t.created_at
  `;
}

export async function getGithubLinkByTicket(
  sql: Sql,
  ticketId: string,
): Promise<GithubLink | null> {
  const [row] = await sql<GithubLink[]>`
    SELECT ticket_id, issue_number, issue_url, created_at
    FROM github_links
    WHERE ticket_id = ${ticketId}
  `;
  return row ?? null;
}
