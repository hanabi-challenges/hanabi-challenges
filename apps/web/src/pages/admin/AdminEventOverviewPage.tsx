import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useEvent } from '../../hooks/useEvent';
import { useStages } from '../../hooks/useStages';
import { useAuth } from '../../context/AuthContext';
import { ApiError, patchJsonAuth, putJsonAuth } from '../../lib/api';
import { useState } from 'react';
import { AdminEntityCard } from '../../features/admin/components';

type EventStatus =
  | 'ANNOUNCED'
  | 'UPCOMING'
  | 'REGISTRATION_OPEN'
  | 'IN_PROGRESS'
  | 'LIVE'
  | 'COMPLETE'
  | 'DORMANT';

function statusColor(status: EventStatus): string {
  switch (status) {
    case 'REGISTRATION_OPEN':
      return 'green';
    case 'IN_PROGRESS':
    case 'LIVE':
      return 'blue';
    case 'COMPLETE':
      return 'gray';
    case 'UPCOMING':
      return 'yellow';
    case 'ANNOUNCED':
      return 'cyan';
    default:
      return 'gray';
  }
}

function statusLabel(status: EventStatus): string {
  switch (status) {
    case 'REGISTRATION_OPEN':
      return 'Registration Open';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'LIVE':
      return 'Live';
    case 'COMPLETE':
      return 'Complete';
    case 'UPCOMING':
      return 'Upcoming';
    case 'ANNOUNCED':
      return 'Announced';
    case 'DORMANT':
      return 'Dormant';
    default:
      return status;
  }
}

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'blue';
    case 'GAUNTLET':
      return 'violet';
    case 'MATCH_PLAY':
      return 'orange';
    default:
      return 'gray';
  }
}

function mechanismLabel(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'Leaderboard';
    case 'GAUNTLET':
      return 'Gauntlet';
    case 'MATCH_PLAY':
      return 'Match Play';
    default:
      return mechanism;
  }
}

export function AdminEventOverviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { event, loading: eventLoading, error: eventError, refetch } = useEvent(slug);
  const { stages, loading: stagesLoading } = useStages(slug);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleTogglePublish() {
    if (!token || !slug) return;
    setActionError(null);
    setBusy(true);
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/publish`, token, {});
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to update')
          : 'Failed to update',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenRegistration() {
    if (!token || !slug) return;
    setActionError(null);
    setBusy(true);
    try {
      await putJsonAuth(`/events/${encodeURIComponent(slug)}`, token, {
        registration_opens_at: new Date().toISOString(),
      });
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to update')
          : 'Failed to update',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCloseRegistration() {
    if (!token || !slug) return;
    setActionError(null);
    setBusy(true);
    try {
      await putJsonAuth(`/events/${encodeURIComponent(slug)}`, token, {
        registration_cutoff: new Date().toISOString(),
      });
      refetch();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to update')
          : 'Failed to update',
      );
    } finally {
      setBusy(false);
    }
  }

  if (eventLoading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (eventError || !event) {
    return (
      <Alert color="red" variant="light">
        {eventError ?? 'Event not found.'}
      </Alert>
    );
  }

  const teamSizesLabel = event.allowed_team_sizes.map((s) => `${s}p`).join(', ');
  const regMode = event.registration_mode === 'ACTIVE' ? 'Active' : 'Passive';
  const canOpenRegistration =
    event.status === 'ANNOUNCED' ||
    (event.registration_opens_at !== null && new Date(event.registration_opens_at) > new Date());
  const canCloseRegistration = event.status === 'REGISTRATION_OPEN';

  return (
    <Stack gap="lg">
      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

      {/* Metadata + actions */}
      <SectionCard>
        <Stack gap="sm">
          <Group justify="space-between" align="flex-start">
            <Stack gap="xs">
              <PageHeader title={event.name} level={3} />
              <Group gap="xs">
                <Badge color={statusColor(event.status as EventStatus)} variant="light" size="sm">
                  {statusLabel(event.status as EventStatus)}
                </Badge>
                {!event.published ? (
                  <Badge color="orange" variant="light" size="sm">
                    Draft
                  </Badge>
                ) : null}
              </Group>
            </Stack>

            <Group gap="xs">
              <Button
                variant="default"
                size="sm"
                disabled={busy}
                onClick={() => navigate(`/admin/events/${slug}/edit`)}
              >
                Edit
              </Button>
              <Button
                variant={event.published ? 'outline' : 'filled'}
                color={event.published ? 'gray' : 'blue'}
                size="sm"
                disabled={busy}
                onClick={() => void handleTogglePublish()}
              >
                {event.published ? 'Unpublish' : 'Publish'}
              </Button>
            </Group>
          </Group>

          <Group gap="md">
            <Text size="sm" c="dimmed">
              Team sizes: <strong>{teamSizesLabel}</strong>
            </Text>
            <Text size="sm" c="dimmed">
              Registration: <strong>{regMode}</strong>
            </Text>
            {event.registration_opens_at ? (
              <Text size="sm" c="dimmed">
                Opens: <strong>{new Date(event.registration_opens_at).toLocaleDateString()}</strong>
              </Text>
            ) : null}
            {event.registration_cutoff ? (
              <Text size="sm" c="dimmed">
                Closes: <strong>{new Date(event.registration_cutoff).toLocaleDateString()}</strong>
              </Text>
            ) : null}
          </Group>

          {(canOpenRegistration || canCloseRegistration) && (
            <Group gap="xs">
              {canOpenRegistration && (
                <Button
                  size="sm"
                  color="green"
                  variant="light"
                  disabled={busy}
                  onClick={() => void handleOpenRegistration()}
                >
                  Open Registration Now
                </Button>
              )}
              {canCloseRegistration && (
                <Button
                  size="sm"
                  color="red"
                  variant="light"
                  disabled={busy}
                  onClick={() => void handleCloseRegistration()}
                >
                  Close Registration Now
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </SectionCard>

      {/* Stages */}
      <Stack gap="sm">
        <Text fw={600} size="sm">
          Stages ({event.stage_count})
        </Text>
        {stagesLoading ? (
          <Text c="dimmed" size="sm">
            Loading stages…
          </Text>
        ) : stages.length === 0 ? (
          <Text c="dimmed" size="sm">
            No stages yet.
          </Text>
        ) : (
          stages.map((stage) => (
            <AdminEntityCard
              key={stage.id}
              title={stage.label}
              href={`/admin/events/${slug}/stages`}
              subtitle={`${stage.game_slot_count} game slot${stage.game_slot_count === 1 ? '' : 's'} · ${stage.team_count} team${stage.team_count === 1 ? '' : 's'}`}
              leftSlot={
                <Group gap={4}>
                  <Badge color={mechanismColor(stage.mechanism)} variant="light" size="sm">
                    {mechanismLabel(stage.mechanism)}
                  </Badge>
                  <Badge variant="light" size="sm">
                    {stage.status}
                  </Badge>
                </Group>
              }
            />
          ))
        )}
      </Stack>

      {/* Section links */}
      <Stack gap="sm">
        <Text fw={600} size="sm">
          Manage
        </Text>
        <Group gap="sm">
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate(`/admin/events/${slug}/registrations`)}
          >
            Registrations
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate(`/admin/events/${slug}/results`)}
          >
            Results
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => navigate(`/admin/events/${slug}/awards`)}
          >
            Awards
          </Button>
        </Group>
      </Stack>
    </Stack>
  );
}
