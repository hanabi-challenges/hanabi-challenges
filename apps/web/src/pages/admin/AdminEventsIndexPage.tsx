import {
  ActionIcon,
  CoreAlert as Alert,
  CoreButton as Button,
  CoreGroup as Group,
  CoreModal as Modal,
  PageHeader,
  CoreStack as Stack,
  CoreText as Text,
  CoreTooltip as Tooltip,
} from '../../design-system';
import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useEvents } from '../../hooks/useEvents';
import { useAuth } from '../../context/AuthContext';
import { ApiError, deleteJsonAuth, putJsonAuth } from '../../lib/api';
import { MaterialIcon } from '../../design-system';
import { AdminEntityCard } from '../../features/admin/components';

export function AdminEventsIndexPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { events, loading, error, refetch } = useEvents({ includeUnpublishedForAdmin: true });
  const [busyBySlug, setBusyBySlug] = useState<Record<string, boolean>>({});
  const [statusError, setStatusError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ slug: string; name: string } | null>(null);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      if (a.published !== b.published) {
        return a.published ? 1 : -1; // drafts first
      }
      return b.id - a.id;
    });
  }, [events]);

  async function togglePublished(slug: string, published: boolean) {
    if (!token) return;
    setStatusError(null);
    setBusyBySlug((prev) => ({ ...prev, [slug]: true }));
    try {
      await putJsonAuth(`/events/${encodeURIComponent(slug)}`, token, {
        published: !published,
      });
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError((err.body as { error?: string })?.error ?? 'Failed to update publish state');
      } else {
        setStatusError('Failed to update publish state');
      }
    } finally {
      setBusyBySlug((prev) => ({ ...prev, [slug]: false }));
    }
  }

  async function confirmDelete() {
    if (!token || !deleteTarget) return;
    const slug = deleteTarget.slug;
    setStatusError(null);
    setBusyBySlug((prev) => ({ ...prev, [slug]: true }));
    try {
      await deleteJsonAuth<unknown>(`/events/${encodeURIComponent(slug)}`, token);
      setDeleteTarget(null);
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError((err.body as { error?: string })?.error ?? 'Failed to delete event');
      } else {
        setStatusError('Failed to delete event');
      }
    } finally {
      setBusyBySlug((prev) => ({ ...prev, [slug]: false }));
    }
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Events"
        subtitle="Manage event lifecycle and setup."
        level={3}
        actions={
          <Button component={Link} to="/admin/events/create">
            Create Event
          </Button>
        }
      />

      {statusError ? (
        <Alert color="red" variant="light">
          {statusError}
        </Alert>
      ) : null}

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Text c="dimmed" size="sm">
          Loading events...
        </Text>
      ) : (
        <Stack gap="sm">
          {sortedEvents.map((event) => {
            const busy = Boolean(busyBySlug[event.slug]);
            return (
              <AdminEntityCard
                key={event.id}
                title={event.name}
                subtitle={event.short_description}
                actions={
                  <Group gap={4} wrap="nowrap">
                    <Tooltip label={event.published ? 'Unpublish' : 'Publish'}>
                      <ActionIcon
                        variant="subtle"
                        color={event.published ? 'gray' : 'blue'}
                        aria-label={event.published ? 'Unpublish event' : 'Publish event'}
                        onClick={() => void togglePublished(event.slug, event.published)}
                        disabled={busy}
                      >
                        <MaterialIcon name={event.published ? 'visibility_off' : 'visibility'} />
                      </ActionIcon>
                    </Tooltip>

                    <Tooltip label="Edit">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        aria-label="Edit event"
                        onClick={() => navigate(`/admin/events/${event.slug}/edit`)}
                        disabled={busy}
                      >
                        <MaterialIcon name="edit" />
                      </ActionIcon>
                    </Tooltip>

                    <Tooltip label="Delete">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Delete event"
                        onClick={() => setDeleteTarget({ slug: event.slug, name: event.name })}
                        disabled={busy}
                      >
                        <MaterialIcon name="delete" />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                }
              />
            );
          })}
        </Stack>
      )}

      <Modal
        opened={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete event?"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Delete{' '}
            <Text span fw={700}>
              {deleteTarget?.name}
            </Text>
            ? This action cannot be undone.
          </Text>
          <Group justify="end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button color="red" onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
