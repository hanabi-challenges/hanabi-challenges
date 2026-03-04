import { useCallback, useEffect, useState } from 'react';
import {
  listNotificationsAuth,
  markAllNotificationsReadAuth,
  markNotificationReadAuth,
  type UserNotification,
} from './notificationsApi';

function getNotificationDestination(notification: UserNotification): string | null {
  const slug = notification.payload_json?.event_slug;
  return typeof slug === 'string' && slug.length > 0 ? `/events/${slug}` : null;
}

export function notificationKey(notification: UserNotification): string {
  return `${notification.id}:${notification.kind}`;
}

export function useNotificationsFeed(params: {
  token: string | null;
  userId: number | null;
  onNavigate?: (destination: string) => void;
}) {
  const { token, userId, onNavigate } = params;
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const refreshNotifications = useCallback(async () => {
    if (!token || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    try {
      const data = await listNotificationsAuth(token, 30);
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // non-blocking UI feature; ignore transient failures
    }
  }, [token, userId]);

  useEffect(() => {
    void refreshNotifications();
    if (!token || !userId) return;

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) return;

      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host;
      const url = `${protocol}://${host}/ws/notifications?token=${encodeURIComponent(token)}`;

      const nextSocket = new WebSocket(url);
      socket = nextSocket;

      nextSocket.onopen = () => {
        if (cancelled) {
          nextSocket.close();
        }
      };

      nextSocket.onmessage = (event) => {
        if (nextSocket !== socket || cancelled) return;
        try {
          const message = JSON.parse(event.data) as { type?: string };
          if (message.type === 'notification_created') {
            void refreshNotifications();
          }
        } catch {
          // ignore malformed messages
        }
      };

      nextSocket.onclose = () => {
        if (nextSocket !== socket || cancelled) return;
        reconnectTimer = window.setTimeout(connect, 1500);
      };

      nextSocket.onerror = () => {
        // Let onclose handle reconnect behavior.
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
      }
      if (socket) {
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        if (socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      }
    };
  }, [token, userId, refreshNotifications]);

  useEffect(() => {
    if (menuOpen) {
      void refreshNotifications();
    }
  }, [menuOpen, refreshNotifications]);

  const handleNotificationClick = useCallback(
    async (notification: UserNotification) => {
      if (!token) return;
      if (!notification.read_at) {
        try {
          await markNotificationReadAuth(token, notification.id);
        } catch {
          // best effort only
        }
      }

      const destination = getNotificationDestination(notification);
      await refreshNotifications();
      if (destination && onNavigate) onNavigate(destination);
    },
    [token, refreshNotifications, onNavigate],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!token || unreadCount === 0) return;
    try {
      await markAllNotificationsReadAuth(token);
      await refreshNotifications();
    } catch {
      // best effort only
    }
  }, [token, unreadCount, refreshNotifications]);

  return {
    notifications,
    unreadCount,
    menuOpen,
    setMenuOpen,
    handleNotificationClick,
    handleMarkAllRead,
  };
}
