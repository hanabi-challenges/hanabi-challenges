// frontend/src/features/events/EventCard.tsx
import React from 'react';
import { Badge, Card, CardBody, CardHeader, Heading, Inline, Stack } from '../../design-system';
import { MarkdownRenderer } from '../../ui/MarkdownRenderer';

type DescriptionKind = 'short' | 'long';

type EventLike = {
  slug: string;
  name: string;
  long_description?: string | null;
  short_description?: string | null;
  starts_at: string | null;
  ends_at: string | null;
  registration_opens_at?: string | null;
  registration_cutoff?: string | null;
  allow_late_registration?: boolean;
  published?: boolean;
  event_format?: string;
  event_status?: string;
};

type EventCardProps = {
  event: EventLike;
  description?: DescriptionKind;
  now?: number;
  linkTo?: string;
  disableLink?: boolean;
  showDatePill?: boolean;
  showRegPill?: boolean;
  headerAction?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  footer?: React.ReactNode;
  body?: React.ReactNode;
};

/**
 * EventCard
 * Feature-scoped wrapper around the design-system Card tuned for events.
 * Defaults to outline styling, shows name + pills, and renders the chosen description.
 */
export function EventCard({
  event,
  description = 'long',
  now = Date.now(),
  linkTo = `/events/${event.slug}`,
  disableLink = false,
  showDatePill = true,
  showRegPill = true,
  headerAction,
  secondaryAction,
  footer,
  body,
}: EventCardProps) {
  const [suppressHover, setSuppressHover] = React.useState(false);
  const bodyText =
    description === 'long'
      ? event.long_description || event.short_description || 'No description provided.'
      : event.short_description || 'No description provided.';

  return (
    <Card
      variant="outline"
      href={disableLink ? undefined : linkTo}
      interactive={!disableLink}
      className={suppressHover ? 'ui-card--suppress-hover' : undefined}
    >
      <CardHeader>
        <Stack gap="xs">
          <Inline align="center" justify="space-between" wrap>
            <Heading level={3}>{event.name}</Heading>
            {headerAction || secondaryAction ? (
              <Inline
                gap="xs"
                onMouseEnter={() => setSuppressHover(true)}
                onMouseLeave={() => setSuppressHover(false)}
                onClick={(e) => e.stopPropagation()}
              >
                {headerAction}
                {secondaryAction}
              </Inline>
            ) : null}
          </Inline>
          <Inline gap="xs" wrap align="center">
            {showDatePill && renderDatePill(event, now)}
            {showRegPill && renderRegPill(event, now)}
          </Inline>
        </Stack>
      </CardHeader>
      <CardBody>
        <Stack gap="sm">
          {body ? body : <MarkdownRenderer markdown={bodyText} />}
          {footer}
        </Stack>
      </CardBody>
    </Card>
  );
}

function renderDatePill(event: EventLike, nowMs: number) {
  if (!event.starts_at && !event.ends_at) return null;
  const startMs = event.starts_at ? new Date(event.starts_at).getTime() : null;
  if (startMs && startMs > nowMs) return null;
  return (
    <Badge size="sm" tone="info">
      {formatDateRange(event.starts_at, event.ends_at) ?? ''}
    </Badge>
  );
}

function renderRegPill(event: EventLike, nowMs: number) {
  if (event.event_format === 'session_ladder') {
    if (event.event_status === 'LIVE') {
      return (
        <Badge size="sm" tone="success">
          Live
        </Badge>
      );
    }
    if (event.event_status === 'COMPLETE') {
      return <Badge size="sm">Completed</Badge>;
    }
    return null;
  }

  const regOpens = event.registration_opens_at
    ? new Date(event.registration_opens_at).getTime()
    : event.starts_at
      ? new Date(event.starts_at).getTime()
      : null;
  const cutoff = event.registration_cutoff
    ? new Date(event.registration_cutoff).getTime()
    : event.ends_at
      ? new Date(event.ends_at).getTime()
      : null;

  if (regOpens && nowMs < regOpens) {
    return <Badge size="sm">Registration opens in {formatCountdown(regOpens - nowMs)}</Badge>;
  }
  if (cutoff && nowMs < cutoff) {
    return (
      <Badge size="sm" tone="warning">
        Registration closes in {formatCountdown(cutoff - nowMs)}
      </Badge>
    );
  }
  if (cutoff && nowMs >= cutoff && !event.allow_late_registration) {
    return <Badge size="sm">Registration closed</Badge>;
  }
  return null;
}

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt && !endsAt) return null;
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  if (start && end) return `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`;
  if (start) return `Starts ${start.toLocaleDateString()}`;
  if (end) return `Ends ${end.toLocaleDateString()}`;
  return null;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
