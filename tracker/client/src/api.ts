import type {
  ListTicketsResponse,
  GetTicketResponse,
  CreateTicketRequest,
  CreateTicketResponse,
  ListCommentsResponse,
  CreateCommentRequest,
  CreateCommentResponse,
  TicketVoteState,
  ListNotificationsResponse,
  LookupsResponse,
  TransitionTicketRequest,
  TransitionTicketResponse,
} from '@tracker/types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  getLookups: () => apiFetch<LookupsResponse>('/tracker/api/lookups'),

  listTickets: (limit = 25, offset = 0) =>
    apiFetch<ListTicketsResponse>(`/tracker/api/tickets?limit=${limit}&offset=${offset}`),

  getTicket: (id: string) => apiFetch<GetTicketResponse>(`/tracker/api/tickets/${id}`),

  createTicket: (body: CreateTicketRequest) =>
    apiFetch<CreateTicketResponse>('/tracker/api/tickets', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listComments: (ticketId: string) =>
    apiFetch<ListCommentsResponse>(`/tracker/api/tickets/${ticketId}/comments`),

  addComment: (ticketId: string, body: CreateCommentRequest) =>
    apiFetch<CreateCommentResponse>(`/tracker/api/tickets/${ticketId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getVotes: (ticketId: string) =>
    apiFetch<TicketVoteState>(`/tracker/api/tickets/${ticketId}/votes`),

  castVote: (ticketId: string, action: 'add' | 'remove') =>
    apiFetch<TicketVoteState>(`/tracker/api/tickets/${ticketId}/votes`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  getNotifications: () => apiFetch<ListNotificationsResponse>('/tracker/api/me/notifications'),

  markNotificationRead: (id: string) =>
    fetch(`/tracker/api/me/notifications/${id}/read`, { method: 'PATCH' }),

  transitionTicket: (id: string, body: TransitionTicketRequest) =>
    apiFetch<TransitionTicketResponse>(`/tracker/api/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
