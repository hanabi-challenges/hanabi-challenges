import type { Server as HttpServer } from 'http';
import { WebSocketServer, type WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { env } from '../../config/env';

type NotificationSocketMessage =
  | {
      type: 'notification_created';
      user_id: number;
      notification_id: number;
      kind: string;
    }
  | {
      type: 'connected';
      user_id: number;
    };

const socketsByUserId = new Map<number, Set<WebSocket>>();
let listenerStarted = false;

function addSocket(userId: number, socket: WebSocket): void {
  const set = socketsByUserId.get(userId) ?? new Set<WebSocket>();
  set.add(socket);
  socketsByUserId.set(userId, set);
}

function removeSocket(userId: number, socket: WebSocket): void {
  const set = socketsByUserId.get(userId);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) {
    socketsByUserId.delete(userId);
  }
}

function sendToUser(userId: number, message: NotificationSocketMessage): void {
  const set = socketsByUserId.get(userId);
  if (!set) return;
  const payload = JSON.stringify(message);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
}

export function initNotificationsWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws/notifications' });

  wss.on('connection', (socket, request) => {
    try {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
      const token = url.searchParams.get('token') ?? '';
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: number };
      const userId = Number(payload.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        socket.close(1008, 'Unauthorized');
        return;
      }

      addSocket(userId, socket);
      socket.send(
        JSON.stringify({ type: 'connected', user_id: userId } satisfies NotificationSocketMessage),
      );

      socket.on('close', () => {
        removeSocket(userId, socket);
      });
    } catch {
      socket.close(1008, 'Unauthorized');
    }
  });
}

export async function startNotificationDbListener(): Promise<void> {
  if (listenerStarted) return;
  listenerStarted = true;

  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  await client.query('LISTEN user_notification');

  client.on('notification', (msg) => {
    if (msg.channel !== 'user_notification' || !msg.payload) return;
    try {
      const parsed = JSON.parse(msg.payload) as {
        user_id?: number;
        notification_id?: number;
        kind?: string;
      };
      const userId = Number(parsed.user_id);
      const notificationId = Number(parsed.notification_id);
      if (!Number.isInteger(userId) || !Number.isInteger(notificationId)) return;

      sendToUser(userId, {
        type: 'notification_created',
        user_id: userId,
        notification_id: notificationId,
        kind: parsed.kind ?? 'badge_awarded',
      });
    } catch {
      // ignore malformed payloads
    }
  });

  client.on('error', (err) => {
    console.error('Notifications DB listener error', err);
  });
}
