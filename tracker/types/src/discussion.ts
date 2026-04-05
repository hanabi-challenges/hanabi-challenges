/** A single comment on a ticket. */
export interface TicketComment {
  id: string;
  ticket_id: string;
  author_display_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

/** Request body for adding a comment. */
export interface CreateCommentRequest {
  body: string;
  is_internal?: boolean;
}

/** Response body for a successfully created comment. */
export interface CreateCommentResponse {
  id: string;
}

/** Response body for listing comments on a ticket. */
export interface ListCommentsResponse {
  comments: TicketComment[];
}

/** Response body for the vote state on a ticket. */
export interface TicketVoteState {
  ticket_id: string;
  vote_count: number;
  user_has_voted: boolean;
}

/** Response body for the pin state on a ticket. */
export interface TicketPinState {
  ticket_id: string;
  is_pinned: boolean;
}

/** Response body for the subscription state on a ticket. */
export interface TicketSubscriptionState {
  ticket_id: string;
  is_subscribed: boolean;
}
