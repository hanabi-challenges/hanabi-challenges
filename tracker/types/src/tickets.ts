/** Ticket type slugs. */
export type TicketTypeSlug = 'bug' | 'idea' | 'feedback';

/** Domain slugs. */
export type DomainSlug =
  | 'site_and_ui'
  | 'competition_rules'
  | 'content_and_docs'
  | 'community_and_moderation'
  | 'infrastructure';

/** Status slugs. */
export type StatusSlug =
  | 'submitted'
  | 'needs_clarification'
  | 'in_triage'
  | 'open'
  | 'planned'
  | 'in_progress'
  | 'shipped'
  | 'declined'
  | 'noted'
  | 'duplicate'
  | 'abandoned';

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
