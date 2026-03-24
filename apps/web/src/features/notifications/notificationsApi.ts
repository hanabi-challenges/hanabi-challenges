import { getJsonAuth, postJsonAuth } from '../../lib/api';

export type UserNotification = {
  id: number;
  user_id: number;
  kind: 'badge_awarded' | 'award_granted';
  title: string;
  body: string;
  payload_json: {
    event_badge_id?: number;
    event_slug?: string;
    event_name?: string;
    badge_name?: string;
    badge_icon?: string;
    badge_rank?: string;
    award_id?: number;
    award_name?: string;
    [key: string]: unknown;
  };
  read_at: string | null;
  created_at: string;
};

export async function listNotificationsAuth(
  token: string,
  limit = 25,
): Promise<{ notifications: UserNotification[]; unread_count: number }> {
  return getJsonAuth<{ notifications: UserNotification[]; unread_count: number }>(
    `/notifications?limit=${String(limit)}`,
    token,
  );
}

export async function markNotificationReadAuth(token: string, id: number): Promise<void> {
  await postJsonAuth<{ ok: true }>(`/notifications/${String(id)}/read`, token, {});
}

export async function markAllNotificationsReadAuth(
  token: string,
): Promise<{ ok: true; marked: number }> {
  return postJsonAuth<{ ok: true; marked: number }>(`/notifications/read-all`, token, {});
}
