// frontend/src/features/events/EventCard.tsx
import React from 'react';
import { CoreBox as Box } from '../../design-system';
import { Card, CardBody, CardHeader, Heading, Inline, Pill, Stack } from '../../design-system';
import './EventCard.css';
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
  event_format?: 'challenge' | 'tournament' | 'session_ladder';
  event_status?: 'DORMANT' | 'LIVE' | 'COMPLETE';
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
                className="event-card__action"
                onMouseEnter={() => setSuppressHover(true)}
                onMouseLeave={() => setSuppressHover(false)}
                onClick={(e) => e.stopPropagation()}
              >
                {headerAction}
                {secondaryAction}
              </Inline>
            ) : null}
          </Inline>
          <Inline gap="xs" wrap align="center" className="event-card__pills">
            {showDatePill && renderDatePill(event, now)}
            {showRegPill && renderRegPill(event, now)}
          </Inline>
        </Stack>
      </CardHeader>
      <CardBody>
        {body ? body : <MarkdownRenderer markdown={bodyText} />}
        {footer ? <Box className="event-card__footer">{footer}</Box> : null}
      </CardBody>
    </Card>
  );
}

function renderDatePill(event: EventLike, nowMs: number) {
  if (!event.starts_at && !event.ends_at) return null;
  const startMs = event.starts_at ? new Date(event.starts_at).getTime() : null;
  if (startMs && startMs > nowMs) return null;
  return (
    <Pill size="sm" variant="accent">
      {formatDateRange(event.starts_at, event.ends_at)}
    </Pill>
  );
}

function renderRegPill(event: EventLike, nowMs: number) {
  if (event.event_format === 'session_ladder') {
    if (event.event_status === 'LIVE') {
      return (
        <Pill size="sm" variant="accent">
          Live
        </Pill>
      );
    }
    if (event.event_status === 'COMPLETE') {
      return (
        <Pill size="sm" variant="default">
          Completed
        </Pill>
      );
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
    return (
      <Pill size="sm" variant="default">
        Registration opens in {formatCountdown(regOpens - nowMs)}
      </Pill>
    );
  }
  if (cutoff && nowMs < cutoff) {
    return (
      <Pill size="sm" variant="accent">
        Registration closes in {formatCountdown(cutoff - nowMs)}
      </Pill>
    );
  }
  if (cutoff && nowMs >= cutoff && !event.allow_late_registration) {
    return (
      <Pill size="sm" variant="default">
        Registration closed
      </Pill>
    );
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
