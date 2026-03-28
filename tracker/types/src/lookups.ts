import type { TicketTypeSlug, DomainSlug, StatusSlug } from './tickets.js';

/** A ticket type lookup row. */
export interface TicketTypeLookup {
  id: number;
  slug: TicketTypeSlug;
  name: string;
}

/** A domain lookup row. */
export interface DomainLookup {
  id: number;
  slug: DomainSlug;
  name: string;
}

/** A status lookup row. */
export interface StatusLookup {
  id: number;
  slug: StatusSlug;
  name: string;
  is_terminal: boolean;
}

/** Response body for GET /tracker/api/lookups */
export interface LookupsResponse {
  ticket_types: TicketTypeLookup[];
  domains: DomainLookup[];
  statuses: StatusLookup[];
}
