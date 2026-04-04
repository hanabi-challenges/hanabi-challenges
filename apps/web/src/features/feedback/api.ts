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
  TicketVoteState,
  TransitionTicketRequest,
  TransitionTicketResponse,
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
  return req(`/tickets/${ticketId}/votes`, { method: 'POST' }, token);
}

export function removeVote(ticketId: string, token: string): Promise<TicketVoteState> {
  return req(`/tickets/${ticketId}/votes`, { method: 'DELETE' }, token);
}

export function transitionStatus(
  ticketId: string,
  data: TransitionTicketRequest,
  token: string,
): Promise<TransitionTicketResponse> {
  return req(`/tickets/${ticketId}/status`, { method: 'PATCH', body: JSON.stringify(data) }, token);
}
