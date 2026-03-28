/** The event types that trigger notification fanout. */
export type NotificationEventType = 'status_changed' | 'comment_added';

/** A single notification for a user. */
export interface UserNotification {
  id: string;
  ticket_id: string;
  ticket_title: string;
  event_type: NotificationEventType;
  actor_display_name: string;
  is_read: boolean;
  created_at: string;
}

/** Response body for GET /tracker/api/me/notifications */
export interface ListNotificationsResponse {
  notifications: UserNotification[];
  unread_count: number;
}
