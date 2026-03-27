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
