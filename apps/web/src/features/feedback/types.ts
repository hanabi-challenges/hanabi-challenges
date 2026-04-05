// Local copies of @tracker/types — keeps apps/web free of a cross-package dependency
// while the workspace is being set up.

export type TicketTypeSlug = 'bug' | 'feature_request' | 'question' | 'feedback' | 'other';

export type DomainSlug =
  | 'gameplay'
  | 'scoring'
  | 'registration'
  | 'interface'
  | 'matchmaking'
  | 'events'
  | 'discord'
  | 'other';

export type StatusSlug =
  | 'submitted'
  | 'triaged'
  | 'in_review'
  | 'in_progress'
  | 'decided'
  | 'resolved'
  | 'rejected'
  | 'closed';

export type BugSeverity = 'cosmetic' | 'functional' | 'blocking';
export type BugReproducibility = 'always' | 'sometimes' | 'once';

export interface TicketTypeLookup {
  id: number;
  slug: TicketTypeSlug;
  name: string;
}

export interface DomainLookup {
  id: number;
  slug: DomainSlug;
  name: string;
}

export interface StatusLookup {
  id: number;
  slug: StatusSlug;
  name: string;
  is_terminal: boolean;
}

export interface LookupsResponse {
  ticket_types: TicketTypeLookup[];
  domains: DomainLookup[];
  statuses: StatusLookup[];
}

export interface TicketSummary {
  id: string;
  title: string;
  description: string;
  type_slug: TicketTypeSlug;
  domain_slug: DomainSlug;
  status_slug: StatusSlug;
  is_terminal: boolean;
  submitted_by_display_name: string;
  submitted_by_color_hex?: string | null;
  submitted_by_text_color?: string | null;
  vote_count?: number;
  comment_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  severity: BugSeverity | null;
  reproducibility: BugReproducibility | null;
}

export interface ListTicketsResponse {
  tickets: TicketSummary[];
  total: number;
  limit: number;
  offset: number;
}

export type GetTicketResponse = TicketDetail;

export interface CreateTicketRequest {
  title: string;
  description: string;
  type_id: number;
  domain_id: number;
  severity?: BugSeverity;
  reproducibility?: BugReproducibility;
}

export interface CreateTicketResponse {
  id: string;
}

export interface TransitionTicketRequest {
  to_status: StatusSlug;
  resolution_note?: string;
}

export interface TransitionTicketResponse {
  id: string;
  status_slug: StatusSlug;
}

export interface MetadataFieldChange {
  from: string | null;
  to: string | null;
}

export interface MetadataChanges {
  type?: MetadataFieldChange;
  domain?: MetadataFieldChange;
  severity?: MetadataFieldChange;
  reproducibility?: MetadataFieldChange;
}

export interface StatusHistoryEntry {
  kind: 'status';
  id: string;
  from_status_slug: StatusSlug | null;
  to_status_slug: StatusSlug;
  changed_by_display_name: string;
  changed_by_color_hex?: string | null;
  changed_by_text_color?: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface MetadataHistoryEntry {
  kind: 'metadata';
  id: string;
  changed_by_display_name: string;
  changed_by_color_hex?: string | null;
  changed_by_text_color?: string | null;
  changes: MetadataChanges;
  created_at: string;
}

export type TicketHistoryEntry = StatusHistoryEntry | MetadataHistoryEntry;

export interface GetTicketHistoryResponse {
  history: TicketHistoryEntry[];
}

export interface UpdateTicketMetadataRequest {
  type_slug?: TicketTypeSlug;
  domain_slug?: DomainSlug;
  severity?: BugSeverity | null;
  reproducibility?: BugReproducibility | null;
}

export type UpdateTicketMetadataResponse = TicketDetail;

export interface TicketComment {
  id: string;
  ticket_id: string;
  author_display_name: string;
  author_color_hex?: string | null;
  author_text_color?: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCommentRequest {
  body: string;
  is_internal?: boolean;
}

export interface CreateCommentResponse {
  id: string;
}

export interface ListCommentsResponse {
  comments: TicketComment[];
}

export interface TicketVoteState {
  ticket_id: string;
  vote_count: number;
  user_has_voted: boolean;
}

export interface TicketPinState {
  ticket_id: string;
  is_pinned: boolean;
}

export interface TicketSubscriptionState {
  ticket_id: string;
  is_subscribed: boolean;
}
