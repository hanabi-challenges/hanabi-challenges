import type {
  ListTicketsResponse,
  GetTicketResponse,
  GetTicketHistoryResponse,
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

  getTicketHistory: (id: string) =>
    apiFetch<GetTicketHistoryResponse>(`/tracker/api/tickets/${id}/history`),

  searchTickets: (q: string) =>
    apiFetch<{ tickets: ListTicketsResponse['tickets'] }>(
      `/tracker/api/tickets/search?q=${encodeURIComponent(q)}`,
    ),

  flagTicket: (id: string) => fetch(`/tracker/api/tickets/${id}/flag`, { method: 'POST' }),

  unflagTicket: (id: string) => fetch(`/tracker/api/tickets/${id}/flag`, { method: 'DELETE' }),

  closeAsDuplicate: (id: string, canonicalTicketId: string) =>
    fetch(`/tracker/api/tickets/${id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canonical_ticket_id: canonicalTicketId }),
    }),

  transitionTicket: (id: string, body: TransitionTicketRequest) =>
    apiFetch<TransitionTicketResponse>(`/tracker/api/tickets/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Admin: users
  listUsers: () =>
    apiFetch<{
      users: Array<{
        id: string;
        hanablive_username: string;
        display_name: string;
        role: string;
        discord_linked: boolean;
      }>;
    }>('/tracker/api/users'),

  assignRole: (userId: string, role: 'moderator' | 'committee') =>
    apiFetch<{ user_id: string; role: string }>(`/tracker/api/users/${userId}/roles`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),

  revokeRole: (userId: string, roleSlug: string) =>
    fetch(`/tracker/api/users/${userId}/roles/${roleSlug}`, { method: 'DELETE' }),

  // Admin: templates
  listTemplates: () =>
    apiFetch<{
      templates: Array<{
        type_slug: string;
        type_name: string;
        body: string;
        updated_at: string | null;
        updated_by: string | null;
      }>;
    }>('/tracker/api/templates'),

  updateTemplate: (typeSlug: string, body: string) =>
    fetch(`/tracker/api/templates/${typeSlug}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }),

  // Admin: GitHub integration health
  getGithubFailures: () =>
    apiFetch<{
      failed_webhooks: Array<{
        id: string;
        github_event: string;
        error: string | null;
        received_at: string;
      }>;
      tickets_missing_link: Array<{
        ticket_id: string;
        ticket_title: string;
        status_slug: string;
      }>;
    }>('/tracker/api/admin/github-failures'),

  runReconcile: () =>
    apiFetch<{
      linked: Array<{
        ticket_id: string;
        ticket_title: string;
        status_slug: string;
        issue_number: number;
        issue_url: string;
      }>;
      missing: Array<{
        ticket_id: string;
        ticket_title: string;
        status_slug: string;
      }>;
    }>('/tracker/api/admin/reconcile'),
};
