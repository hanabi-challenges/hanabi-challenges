import type {
  CreateCommentRequest,
  CreateCommentResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  GetTicketHistoryResponse,
  GetTicketResponse,
  ListCommentsResponse,
  ListTicketsResponse,
  LookupsResponse,
  TicketPinState,
  TicketSubscriptionState,
  TicketVoteState,
  TransitionTicketRequest,
  TransitionTicketResponse,
  UpdateTicketMetadataRequest,
  UpdateTicketMetadataResponse,
} from './types';

const BASE = '/tracker/api';

async function req<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function getLookups(): Promise<LookupsResponse> {
  return req('/lookups');
}

export function listTickets(params: {
  offset?: number;
  limit?: number;
  status_slug?: string;
  type_slug?: string;
  domain_slug?: string;
}): Promise<ListTicketsResponse> {
  const q = new URLSearchParams();
  if (params.offset) q.set('offset', String(params.offset));
  if (params.limit) q.set('limit', String(params.limit));
  if (params.status_slug) q.set('status_slug', params.status_slug);
  if (params.type_slug) q.set('type_slug', params.type_slug);
  if (params.domain_slug) q.set('domain_slug', params.domain_slug);
  const qs = q.toString();
  return req(`/tickets${qs ? `?${qs}` : ''}`);
}

export function getTicket(id: string): Promise<GetTicketResponse> {
  return req(`/tickets/${id}`);
}

export function createTicket(
  data: CreateTicketRequest,
  token: string,
): Promise<CreateTicketResponse> {
  return req('/tickets', { method: 'POST', body: JSON.stringify(data) }, token);
}

export function getTicketHistory(id: string): Promise<GetTicketHistoryResponse> {
  return req(`/tickets/${id}/history`);
}

export function getTicketComments(id: string): Promise<ListCommentsResponse> {
  return req(`/tickets/${id}/comments`);
}

export function createComment(
  ticketId: string,
  data: CreateCommentRequest,
  token: string,
): Promise<CreateCommentResponse> {
  return req(
    `/tickets/${ticketId}/comments`,
    { method: 'POST', body: JSON.stringify(data) },
    token,
  );
}

export function getVoteState(ticketId: string, token?: string | null): Promise<TicketVoteState> {
  return req(`/tickets/${ticketId}/votes`, {}, token);
}

export function castVote(ticketId: string, token: string): Promise<TicketVoteState> {
  return req(
    `/tickets/${ticketId}/votes`,
    { method: 'POST', body: JSON.stringify({ action: 'add' }) },
    token,
  );
}

export function removeVote(ticketId: string, token: string): Promise<TicketVoteState> {
  return req(
    `/tickets/${ticketId}/votes`,
    { method: 'POST', body: JSON.stringify({ action: 'remove' }) },
    token,
  );
}

export function getPinState(ticketId: string, token?: string | null): Promise<TicketPinState> {
  return req(`/tickets/${ticketId}/pins`, {}, token);
}

export function setPinned(
  ticketId: string,
  pinned: boolean,
  token: string,
): Promise<TicketPinState> {
  return req(`/tickets/${ticketId}/pins`, { method: pinned ? 'POST' : 'DELETE' }, token);
}

export function getSubscriptionState(
  ticketId: string,
  token?: string | null,
): Promise<TicketSubscriptionState> {
  return req(`/tickets/${ticketId}/subscriptions`, {}, token);
}

export function setSubscribed(
  ticketId: string,
  subscribed: boolean,
  token: string,
): Promise<TicketSubscriptionState> {
  return req(
    `/tickets/${ticketId}/subscriptions`,
    { method: subscribed ? 'POST' : 'DELETE' },
    token,
  );
}

export interface MentionUser {
  id: number;
  display_name: string;
  color_hex: string;
  text_color: string;
}

export function searchMentionUsers(
  q: string,
  token: string | null,
): Promise<{ users: MentionUser[] }> {
  return req(`/users/mentions?${new URLSearchParams({ q }).toString()}`, {}, token);
}

export function transitionStatus(
  ticketId: string,
  data: TransitionTicketRequest,
  token: string,
): Promise<TransitionTicketResponse> {
  return req(`/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}

export function updateTicketMetadata(
  ticketId: string,
  data: UpdateTicketMetadataRequest,
  token: string,
): Promise<UpdateTicketMetadataResponse> {
  return req(
    `/tickets/${ticketId}/metadata`,
    { method: 'PATCH', body: JSON.stringify(data) },
    token,
  );
}

export function deleteTicket(ticketId: string, token: string): Promise<void> {
  return req(`/tickets/${ticketId}`, { method: 'DELETE' }, token);
}
