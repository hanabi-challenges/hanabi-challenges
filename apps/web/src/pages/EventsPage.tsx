import React from 'react';
import {
  Alert,
  Heading,
  Inline,
  Main,
  PageContainer,
  Pill,
  Section,
  Select,
  Stack,
  Text,
} from '../design-system';
import { EventCard } from '../features/events';
import { useEvents, type EventSummary } from '../hooks/useEvents';

type EventStatus = EventSummary['status'];

const STATUS_LABELS: Record<EventStatus, string> = {
  ANNOUNCED: 'Announced',
  UPCOMING: 'Upcoming',
  REGISTRATION_OPEN: 'Registration Open',
  IN_PROGRESS: 'In Progress',
  LIVE: 'Live',
  COMPLETE: 'Complete',
  DORMANT: 'Dormant',
};

function statusVariant(status: EventStatus): 'default' | 'accent' {
  return status === 'REGISTRATION_OPEN' || status === 'IN_PROGRESS' || status === 'LIVE'
    ? 'accent'
    : 'default';
}

const STATUS_FILTER_OPTIONS = [
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'REGISTRATION_OPEN', label: 'Registration Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETE', label: 'Complete' },
];

export const EventsPage: React.FC = () => {
  const { events, loading, error } = useEvents();
  const [now] = React.useState(() => Date.now());
  const [statusFilter, setStatusFilter] = React.useState('');
  const [teamSizeFilter, setTeamSizeFilter] = React.useState('');

  const allTeamSizes = [...new Set(events.flatMap((e) => e.allowed_team_sizes))].sort(
    (a, b) => a - b,
  );
  const teamSizeOptions = allTeamSizes.map((s) => ({
    value: String(s),
    label: s === 1 ? 'Solo' : `${s}-player`,
  }));

  const filtered = events
    .filter((e) => !statusFilter || e.status === statusFilter)
    .filter((e) => !teamSizeFilter || e.allowed_team_sizes.includes(Number(teamSizeFilter)))
    .sort((a, b) => {
      const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (aStart !== bStart) return aStart - bStart;
      return a.name.localeCompare(b.name);
    });

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" header={<Heading level={1}>Events</Heading>}>
          <Text variant="body">All Hanabi events, past and present.</Text>

          <Inline gap="sm" wrap>
            <Select
              options={STATUS_FILTER_OPTIONS}
              value={statusFilter}
              onChange={setStatusFilter}
              placeholder="All statuses"
            />
            {allTeamSizes.length > 1 ? (
              <Select
                options={teamSizeOptions}
                value={teamSizeFilter}
                onChange={setTeamSizeFilter}
                placeholder="All team sizes"
              />
            ) : null}
          </Inline>

          {loading ? <Text variant="muted">Loading events…</Text> : null}
          {error ? <Alert variant="error" message={error ?? 'Unable to load events.'} /> : null}

          {!loading && !error ? (
            filtered.length === 0 ? (
              <Text variant="muted">No events match the current filters.</Text>
            ) : (
              <Stack gap="sm">
                {filtered.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    description="short"
                    now={now}
                    footer={
                      <Inline gap="xs" wrap>
                        <Pill size="sm" variant={statusVariant(event.status)}>
                          {STATUS_LABELS[event.status]}
                        </Pill>
                        {event.allowed_team_sizes.map((size) => (
                          <Pill key={size} size="sm" variant="default">
                            {size === 1 ? 'Solo' : `${size}-player`}
                          </Pill>
                        ))}
                      </Inline>
                    }
                  />
                ))}
              </Stack>
            )
          ) : null}
        </Section>
      </PageContainer>
    </Main>
  );
};
