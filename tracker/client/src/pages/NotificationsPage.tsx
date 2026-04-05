import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Title,
  Stack,
  Text,
  Loader,
  Alert,
  Card,
  Group,
  Badge,
  Anchor,
  Button,
} from '@mantine/core';
import type { UserNotification } from '@tracker/types';
import { api, ApiError } from '../api.js';

export function NotificationsPage() {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getNotifications()
      .then((data) => setNotifications(data.notifications))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load notifications.');
      })
      .finally(() => setLoading(false));
  }, []);

  function handleMarkRead(id: string) {
    api.markNotificationRead(id).then(() => {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    });
  }

  return (
    <Container size="md" py="md">
      <Stack gap="md">
        <Title order={2}>Notifications</Title>

        {loading && <Loader />}
        {error && <Alert color="red">{error}</Alert>}

        {!loading && !error && notifications.length === 0 && (
          <Text c="dimmed">No notifications.</Text>
        )}

        {notifications.map((n) => (
          <Card key={n.id} withBorder padding="sm" opacity={n.is_read ? 0.6 : 1}>
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text size="sm" fw={n.is_read ? 400 : 600}>
                  <Anchor component={Link} to={`/tickets/${n.ticket_id}`}>
                    {n.ticket_title}
                  </Anchor>
                </Text>
                <Text size="xs" c="dimmed">
                  {n.event_type === 'status_changed' ? 'Status changed' : 'New comment'} by{' '}
                  {n.actor_display_name} · {new Date(n.created_at).toLocaleString()}
                </Text>
              </Stack>
              <Group gap="xs">
                {!n.is_read && (
                  <Badge size="xs" color="blue">
                    new
                  </Badge>
                )}
                {!n.is_read && (
                  <Button size="xs" variant="subtle" onClick={() => handleMarkRead(n.id)}>
                    Mark read
                  </Button>
                )}
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Container>
  );
}
