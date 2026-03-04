import { useMemo, useState } from 'react';
import {
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  CoreTitle as Title,
  CoreTooltip as Tooltip,
  CoreBox as Box,
  Button,
  Select,
  SectionCard,
} from '../../../../design-system';
import { useAuth } from '../../../../context/AuthContext';
import { useEvents } from '../../../../hooks/useEvents';
import { ApiError, deleteJsonAuth, getJsonAuth } from '../../../../lib/api';
import { MaterialIcon } from '../../../../design-system';
import {
  DestructiveActionModal,
  type DestructiveConsequence,
} from '../../../shared/modals/DestructiveActionModal';

export function AdminSystemHomeScreen() {
  const { token } = useAuth();
  const {
    events,
    loading: loadingLists,
    error: listsError,
    refetch,
  } = useEvents({
    includeUnpublishedForAdmin: true,
  });
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingDelete, setLoadingDelete] = useState(false);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [modal, setModal] = useState<{
    slug: string;
    title: string;
    summary: string;
    consequences: DestructiveConsequence[];
  } | null>(null);

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => b.id - a.id);
  }, [events]);

  const eventOptions = useMemo(
    () =>
      sortedEvents.map((event) => ({
        value: event.slug,
        label: event.name,
      })),
    [sortedEvents],
  );

  const selectedEvent = useMemo(
    () => sortedEvents.find((event) => event.slug === selectedSlug) ?? null,
    [sortedEvents, selectedSlug],
  );

  const modalOpen = Boolean(modal);
  const eventLinkHref = selectedEvent ? `/events/${encodeURIComponent(selectedEvent.slug)}` : '';
  const eventLinkTooltip = selectedEvent
    ? `Open event page: ${selectedEvent.name}`
    : 'Select an event to open its page';

  async function reviewDelete() {
    if (!token || !selectedEvent) return;
    setStatus(null);
    setModalError(null);
    setLoadingPreview(true);
    try {
      const preview = await getJsonAuth<{
        id: number;
        slug: string;
        name: string;
        consequences: {
          teams_removed: number;
          games_removed: number;
          sessions_removed: number;
          rounds_removed: number;
          badges_removed: number;
          badge_awards_removed: number;
          memberships_removed: number;
        };
      }>(`/events/${encodeURIComponent(selectedEvent.slug)}/delete-preview`, token);

      setModal({
        slug: preview.slug,
        title: 'Delete event?',
        summary: `Deleting "${preview.name}" is irreversible and will remove all related event data.`,
        consequences: [
          { label: 'Teams removed', value: preview.consequences.teams_removed },
          { label: 'Games removed', value: preview.consequences.games_removed },
          { label: 'Sessions removed', value: preview.consequences.sessions_removed },
          { label: 'Rounds removed', value: preview.consequences.rounds_removed },
          { label: 'Badge awards removed', value: preview.consequences.badge_awards_removed },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setStatus({ ok: false, message: body?.error ?? 'Failed to load delete preview' });
      } else {
        setStatus({ ok: false, message: 'Failed to load delete preview' });
      }
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmDeleteEvent() {
    if (!token || !modal) return;
    setModalError(null);
    setLoadingDelete(true);
    setBusySlug(modal.slug);

    try {
      await deleteJsonAuth<unknown>(`/events/${encodeURIComponent(modal.slug)}`, token);
      setStatus({ ok: true, message: 'Event and related data deleted.' });
      setModal(null);
      if (selectedSlug === modal.slug) {
        setSelectedSlug(null);
      }
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        setModalError(body?.error ?? `Failed to delete event (${err.status})`);
      } else {
        setModalError('Failed to delete event');
      }
    } finally {
      setLoadingDelete(false);
      setBusySlug(null);
    }
  }

  return (
    <Stack gap="md">
      <Title order={3}>Data Deletion</Title>

      <SectionCard>
        <Stack gap="sm">
          <Text fw={700}>Delete event</Text>
          <Group align="end" wrap="wrap">
            <Box style={{ minWidth: 320, flex: 1 }}>
              <Select
                options={eventOptions}
                placeholder="Select event..."
                value={selectedSlug ?? ''}
                onChange={(value) => {
                  setSelectedSlug(value || null);
                  setStatus(null);
                }}
                disabled={loadingLists}
              />
            </Box>
            <Button
              type="button"
              variant="secondary"
              disabled={!selectedEvent || loadingPreview || loadingLists}
              onClick={() => void reviewDelete()}
            >
              {loadingPreview ? 'Loading...' : 'Review delete'}
            </Button>
            <Tooltip label={eventLinkTooltip} withArrow>
              <Button
                as="a"
                href={eventLinkHref}
                variant="secondary"
                disabled={!selectedEvent || loadingLists}
                aria-label={selectedEvent ? 'Open event page' : eventLinkTooltip}
              >
                <MaterialIcon name="open_in_new" />
              </Button>
            </Tooltip>
          </Group>

          {loadingLists ? (
            <Text size="sm" c="dimmed">
              Loading events...
            </Text>
          ) : listsError ? (
            <Text size="sm" c="dimmed">
              {listsError}
            </Text>
          ) : sortedEvents.length === 0 ? (
            <Text size="sm" c="dimmed">
              No events found.
            </Text>
          ) : null}

          {status ? (
            <Text size="sm" c={status.ok ? 'green' : 'red'}>
              {status.message}
            </Text>
          ) : null}
        </Stack>
      </SectionCard>

      <DestructiveActionModal
        opened={modalOpen}
        onClose={() => {
          if (loadingDelete) return;
          setModal(null);
          setModalError(null);
        }}
        title={modal?.title ?? 'Delete event?'}
        summary={modal?.summary ?? ''}
        consequences={modal?.consequences ?? []}
        confirmPhrase="DELETE"
        confirmLabel="Delete"
        loading={loadingDelete || Boolean(busySlug)}
        error={modalError}
        onConfirm={() => void confirmDeleteEvent()}
      />
    </Stack>
  );
}
