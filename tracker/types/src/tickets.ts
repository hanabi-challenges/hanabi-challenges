/** Ticket type slugs — must match ticket_types seed data. */
export type TicketTypeSlug = 'bug' | 'feature_request' | 'question' | 'feedback' | 'other';

/** Domain slugs — must match domains seed data. */
export type DomainSlug =
  | 'gameplay'
  | 'scoring'
  | 'registration'
  | 'interface'
  | 'matchmaking'
  | 'events'
  | 'discord'
  | 'other';

/** Status slugs — must match statuses seed data. */
export type StatusSlug =
  | 'submitted'
  | 'triaged'
  | 'in_review'
  | 'decided'
  | 'resolved'
  | 'rejected'
  | 'closed';

/** Severity levels for bug tickets. */
export type BugSeverity = 'cosmetic' | 'functional' | 'blocking';

/** Reproducibility levels for bug tickets. */
export type BugReproducibility = 'always' | 'sometimes' | 'once';

/** Request body for creating a new ticket. */
export interface CreateTicketRequest {
  title: string;
  description: string;
  type_id: number;
  domain_id: number;
  severity?: BugSeverity;
  reproducibility?: BugReproducibility;
}

/** Response body for a successfully created ticket. */
export interface CreateTicketResponse {
  id: string;
}

/** Summary of a ticket as returned in list views. */
export interface TicketSummary {
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

/** Full ticket detail including description. */
export interface TicketDetail extends TicketSummary {
  description: string;
  severity: BugSeverity | null;
  reproducibility: BugReproducibility | null;
}

/** Response body for GET /tracker/api/tickets */
export interface ListTicketsResponse {
  tickets: TicketSummary[];
  total: number;
  limit: number;
  offset: number;
}

/** Response body for GET /tracker/api/tickets/:id */
export type GetTicketResponse = TicketDetail;

/** Request body for PATCH /tracker/api/tickets/:id/status */
export interface TransitionTicketRequest {
  to_status: StatusSlug;
  resolution_note?: string;
}

/** Response body for a successful status transition. */
export interface TransitionTicketResponse {
  id: string;
  status_slug: StatusSlug;
}

/** A single status transition entry in the ticket history. */
export interface StatusHistoryEntry {
  kind: 'status';
  id: string;
  from_status_slug: StatusSlug | null;
  to_status_slug: StatusSlug;
  changed_by_display_name: string | null;
  changed_by_color_hex: string | null;
  changed_by_text_color: string | null;
  resolution_note: string | null;
  created_at: string;
}

/** The shape of changes in a metadata history entry. */
export interface MetadataChanges {
  type?: { from: TicketTypeSlug; to: TicketTypeSlug };
  domain?: { from: DomainSlug; to: DomainSlug };
  severity?: { from: BugSeverity | null; to: BugSeverity | null };
  reproducibility?: { from: BugReproducibility | null; to: BugReproducibility | null };
}

/** A single metadata edit entry in the ticket history. */
export interface MetadataHistoryEntry {
  kind: 'metadata';
  id: string;
  changed_by_display_name: string;
  changed_by_color_hex: string | null;
  changed_by_text_color: string | null;
  changes: MetadataChanges;
  created_at: string;
}

/** A merged history entry — either a status transition or a metadata edit. */
export type TicketHistoryEntry = StatusHistoryEntry | MetadataHistoryEntry;

/** Response body for GET /tracker/api/tickets/:id/history */
export interface GetTicketHistoryResponse {
  history: TicketHistoryEntry[];
}

/** Request body for PATCH /tracker/api/tickets/:id/metadata */
export interface UpdateTicketMetadataRequest {
  type_slug?: TicketTypeSlug;
  domain_slug?: DomainSlug;
  severity?: BugSeverity | null;
  reproducibility?: BugReproducibility | null;
}

/** Response body for a successful metadata update — the full updated ticket. */
export type UpdateTicketMetadataResponse = TicketDetail;
