import { useState } from 'react';
import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  PageHeader,
  SectionCard,
} from '../../../../design-system';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { useEvent } from '../../../../hooks/useEvent';
import { useAuth } from '../../../../context/AuthContext';
import { ApiError, patchJsonAuth, putJsonAuth } from '../../../../lib/api';
import { EventAdminTabs } from '../../components';

type EventStatus =
  | 'ANNOUNCED'
  | 'UPCOMING'
  | 'REGISTRATION_OPEN'
  | 'IN_PROGRESS'
  | 'LIVE'
  | 'COMPLETE'
  | 'DORMANT';

type PullSlotResult = {
  slotId: number;
  slotName: string | null;
  ingested: number;
  skipped: number;
  errors: string[];
};

type PullProgress = {
  total: number;
  done: number;
  slots: PullSlotResult[];
  finished: boolean;
};

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

export function AdminEventLayoutScreen() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { event, loading, error, refetch } = useEvent(slug);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);

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

  async function handlePullReplays() {
    if (!token || !slug) return;
    setActionError(null);
    setPullProgress({ total: 0, done: 0, slots: [], finished: false });
    setBusy(true);

    try {
      const response = await fetch(`/api/events/${encodeURIComponent(slug)}/pull-replays`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          /* ignore */
        }
        throw new ApiError(`Pull failed`, response.status, body);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop()!; // keep any incomplete trailing chunk

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string } & Record<string, unknown>;
          try {
            evt = JSON.parse(line) as typeof evt;
          } catch {
            continue;
          }

          if (evt.type === 'start') {
            setPullProgress({ total: evt.total as number, done: 0, slots: [], finished: false });
          } else if (evt.type === 'slot') {
            setPullProgress((prev) =>
              prev
                ? {
                    ...prev,
                    done: prev.done + 1,
                    slots: [
                      ...prev.slots,
                      {
                        slotId: evt.slotId as number,
                        slotName: evt.slotName as string | null,
                        ingested: evt.ingested as number,
                        skipped: evt.skipped as number,
                        errors: evt.errors as string[],
                      },
                    ],
                  }
                : prev,
            );
          } else if (evt.type === 'done') {
            setPullProgress((prev) => (prev ? { ...prev, finished: true } : prev));
          }
        }
      }
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Pull failed')
          : 'Pull failed',
      );
      setPullProgress(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (error || !event) {
    return (
      <Alert color="red" variant="light">
        {error ?? 'Event not found.'}
      </Alert>
    );
  }

  const teamSizesLabel = event.allowed_team_sizes.map((s) => `${s}p`).join(', ');
  const regMode = event.registration_mode === 'ACTIVE' ? 'Active' : 'Passive';
  const canOpenRegistration =
    event.status === 'ANNOUNCED' ||
    (event.registration_opens_at !== null && new Date(event.registration_opens_at) > new Date());
  const canCloseRegistration = event.status === 'REGISTRATION_OPEN';

  const totalIngested = pullProgress?.slots.reduce((sum, s) => sum + s.ingested, 0) ?? 0;
  const totalErrors = pullProgress?.slots.flatMap((s) => s.errors) ?? [];

  return (
    <Stack gap="md">
      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

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
            <Button
              size="sm"
              color="violet"
              variant="light"
              disabled={busy}
              onClick={() => void handlePullReplays()}
            >
              {busy && pullProgress && !pullProgress.finished ? 'Pulling…' : 'Pull Replays'}
            </Button>
          </Group>

          {pullProgress ? (
            <Stack gap="xs">
              <Text size="sm" c={pullProgress.finished ? 'dimmed' : 'blue'}>
                {pullProgress.finished
                  ? `Done — ${totalIngested} new result${totalIngested !== 1 ? 's' : ''} ingested${totalErrors.length > 0 ? `, ${totalErrors.length} error${totalErrors.length !== 1 ? 's' : ''}` : ''}`
                  : pullProgress.total > 0
                    ? `Pulling… ${pullProgress.done} / ${pullProgress.total} slots`
                    : 'Starting…'}
              </Text>
              {pullProgress.slots.length > 0 ? (
                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: '1.6',
                  }}
                >
                  {pullProgress.slots.map((s) => (
                    <div
                      key={s.slotId}
                      style={{ color: s.errors.length > 0 ? '#e03131' : 'inherit' }}
                    >
                      {s.errors.length > 0 ? '✗' : s.ingested > 0 ? '✓' : '–'}{' '}
                      {s.slotName ?? `slot ${s.slotId}`}: {s.ingested} ingested, {s.skipped} skipped
                      {s.errors.length > 0
                        ? ` (${s.errors.length} error${s.errors.length !== 1 ? 's' : ''})`
                        : ''}
                    </div>
                  ))}
                </div>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>

      <EventAdminTabs />

      <Outlet />
    </Stack>
  );
}
