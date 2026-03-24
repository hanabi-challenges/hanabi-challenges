import React from 'react';
import {
  Alert,
  Button,
  Heading,
  Inline,
  Main,
  PageContainer,
  Pill,
  Popover,
  Section,
  Select,
  Stack,
  Text,
} from '../design-system';
import { EventCard } from '../features/events';
import { useEvents, type EventSummary } from '../hooks/useEvents';

type EventStatus = EventSummary['status'];

// Collapse fine-grained backend statuses into four user-facing labels.
// ANNOUNCED / UPCOMING / REGISTRATION_OPEN all mean "public but not yet playable".
function displayStatus(status: EventStatus): string {
  switch (status) {
    case 'ANNOUNCED':
    case 'UPCOMING':
    case 'REGISTRATION_OPEN':
      return 'Announced';
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'LIVE':
      return 'Live';
    case 'COMPLETE':
      return 'Complete';
  }
}

function statusVariant(status: EventStatus): 'default' | 'accent' {
  return status === 'IN_PROGRESS' || status === 'LIVE' ? 'accent' : 'default';
}

// Each filter value maps to one or more backend statuses.
type FilterKey = 'ANNOUNCED' | 'IN_PROGRESS' | 'LIVE' | 'COMPLETE';

const STATUS_FILTER_MATCHES: Record<FilterKey, EventStatus[]> = {
  ANNOUNCED: ['ANNOUNCED', 'UPCOMING', 'REGISTRATION_OPEN'],
  IN_PROGRESS: ['IN_PROGRESS'],
  LIVE: ['LIVE'],
  COMPLETE: ['COMPLETE'],
};

const STATUS_FILTER_OPTIONS = [
  { value: 'ANNOUNCED', label: 'Announced' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'LIVE', label: 'Live' },
  { value: 'COMPLETE', label: 'Complete' },
];

export const EventsPage: React.FC = () => {
  const { events, loading, error } = useEvents();
  const [now] = React.useState(() => Date.now());
  const [statusFilter, setStatusFilter] = React.useState('');

  const activeFilterCount = statusFilter ? 1 : 0;

  const filtered = events
    .filter((e) => {
      if (!statusFilter) return true;
      const matches = STATUS_FILTER_MATCHES[statusFilter as FilterKey];
      return matches ? matches.includes(e.status) : false;
    })
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
          <Inline gap="sm" justify="space-between" align="center">
            <Text variant="body">All Hanabi events, past and present.</Text>
            <Popover
              trigger={
                <Button variant="secondary">
                  {activeFilterCount > 0 ? `Filters (${activeFilterCount})` : 'Filters'}
                </Button>
              }
              position="bottom"
              width={240}
            >
              <Stack gap="sm">
                <Select
                  options={STATUS_FILTER_OPTIONS}
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="All statuses"
                />
                {statusFilter ? (
                  <Button variant="secondary" onClick={() => setStatusFilter('')}>
                    Clear filters
                  </Button>
                ) : null}
              </Stack>
            </Popover>
          </Inline>

          {loading ? <Text variant="muted">Loading events…</Text> : null}
          {error ? <Alert variant="error" message={error ?? 'Unable to load events.'} /> : null}

          {!loading && !error ? (
            filtered.length === 0 ? (
              <Text variant="muted">No events match the current filters.</Text>
            ) : (
              <Stack gap="sm" style={{ marginTop: 'var(--ds-space-lg)' }}>
                {filtered.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    description="short"
                    now={now}
                    footer={
                      <Inline gap="xs" wrap>
                        <Pill size="sm" variant={statusVariant(event.status)}>
                          {displayStatus(event.status)}
                        </Pill>
                        {event.status === 'COMPLETE' && event.allow_late_registration ? (
                          <Pill size="sm" variant="default">
                            Late submissions open
                          </Pill>
                        ) : null}
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
