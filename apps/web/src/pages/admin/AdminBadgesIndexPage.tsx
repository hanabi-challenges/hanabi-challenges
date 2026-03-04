import {
  ActionIcon,
  CoreAlert as Alert,
  CoreBox as Box,
  CoreButton as Button,
  CoreGroup as Group,
  CoreImage as Image,
  CoreModal as Modal,
  PageHeader,
  CoreStack as Stack,
  CoreText as Text,
  CoreTooltip as Tooltip,
} from '../../design-system';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useEvents } from '../../hooks/useEvents';
import { deleteBadgeSetAuth, listBadgeSetsAuth, type BadgeSetRecord } from './badgeSetsApi';
import { MaterialIcon } from '../../design-system';
import { AdminEntityCard } from '../../features/admin/components';

export function AdminBadgesIndexPage() {
  const auth = useAuth();
  const [sets, setSets] = useState<BadgeSetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<BadgeSetRecord | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { events } = useEvents({ includeUnpublishedForAdmin: true });

  useEffect(() => {
    if (!auth.token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const next = await listBadgeSetsAuth(auth.token as string);
        if (!cancelled) setSets(next);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | null;
          setError(body?.error ?? `Failed to load badge sets (${err.status})`);
        } else {
          setError('Failed to load badge sets');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.token]);

  const sorted = useMemo(() => {
    return [...sets].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  }, [sets]);

  function removeSet() {
    if (!deleteTarget || !auth.token) return;
    void (async () => {
      try {
        await deleteBadgeSetAuth(auth.token as string, deleteTarget.id);
        setSets((prev) => prev.filter((set) => set.id !== deleteTarget.id));
        setStatus(`Deleted "${deleteTarget.name}".`);
        setDeleteTarget(null);
      } catch (err) {
        if (err instanceof ApiError) {
          const body = err.body as { error?: string } | null;
          setError(body?.error ?? `Failed to delete badge set (${err.status})`);
        } else {
          setError('Failed to delete badge set');
        }
      }
    })();
  }

  return (
    <Stack gap="md">
      <PageHeader
        title="Badge Sets"
        subtitle="Manage saved badge sets and event attachments."
        level={3}
        actions={
          <Button component={Link} to="/admin/badges/new">
            Create Badge Set
          </Button>
        }
      />

      {status ? (
        <Alert color="green" variant="light">
          {status}
        </Alert>
      ) : null}
      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <Text size="sm" c="dimmed">
          Loading badge sets...
        </Text>
      ) : sorted.length === 0 ? (
        <Text size="sm" c="dimmed">
          No badge sets yet.
        </Text>
      ) : (
        <Stack gap="sm">
          {sorted.map((set) => {
            const validAttachmentLinks = set.attachments.filter((attachment) => {
              const slug = attachment.event_slug?.trim();
              if (!slug) return false;
              // Only treat as attached if the target event actually exists.
              return events.some((event) => event.slug === slug);
            });
            const eventLinks = Array.from(
              new Map(
                validAttachmentLinks.map((attachment) => [
                  attachment.event_slug.trim(),
                  attachment.event_name,
                ]),
              ).entries(),
            );
            const attachedPublished = validAttachmentLinks.some(
              (attachment) => attachment.event_published,
            );
            const previewDataUri = `data:image/svg+xml;utf8,${encodeURIComponent(set.preview_svg)}`;
            return (
              <AdminEntityCard
                key={set.id}
                title={set.name}
                leftSlot={
                  <Box
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 6,
                      border: '1px solid rgba(0,0,0,0.15)',
                      background: 'var(--ds-color-surface)',
                      overflow: 'hidden',
                      flex: '0 0 auto',
                    }}
                  >
                    <Image
                      src={previewDataUri}
                      alt=""
                      aria-hidden="true"
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'block',
                        objectFit: 'contain',
                      }}
                    />
                  </Box>
                }
                actions={
                  <Group gap={4} wrap="nowrap">
                    {eventLinks.map(([slug, name]) => (
                      <Tooltip key={`${set.id}-${slug}`} label={name}>
                        <ActionIcon
                          component={Link}
                          to={`/events/${slug}`}
                          variant="subtle"
                          color="gray"
                        >
                          <MaterialIcon name="link" />
                        </ActionIcon>
                      </Tooltip>
                    ))}
                    <Tooltip label="Edit">
                      <ActionIcon
                        component={Link}
                        to={`/admin/badges/${String(set.id)}/edit`}
                        variant="subtle"
                        color="blue"
                      >
                        <MaterialIcon name="edit" />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip
                      label={
                        attachedPublished
                          ? 'Cannot delete: attached to a published event'
                          : 'Delete'
                      }
                    >
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => setDeleteTarget(set)}
                        disabled={attachedPublished}
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
        title="Delete badge set?"
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
            <Button color="red" onClick={removeSet}>
              Delete
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
