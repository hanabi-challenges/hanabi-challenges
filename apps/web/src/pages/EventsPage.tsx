import React from 'react';
import { Alert, Heading, PageContainer, Section, Stack, Text, Main } from '../design-system';
import { EventCard } from '../features/events';
import { useEvents } from '../hooks/useEvents';

export const EventsPage: React.FC = () => {
  const { events, loading, error } = useEvents();
  const [now] = React.useState(() => Date.now());

  const isCompleted = (event: (typeof events)[number]) => {
    if (event.event_format === 'session_ladder') {
      return event.event_status === 'COMPLETE';
    }
    if (!event.ends_at) return false;
    return new Date(event.ends_at).getTime() < now;
  };

  const sorted = [...events].sort((a, b) => {
    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (aStart !== bStart) return aStart - bStart;
    return a.name.localeCompare(b.name);
  });

  const activeEvents = sorted.filter((event) => !isCompleted(event));
  const completedEvents = sorted.filter((event) => isCompleted(event));

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" header={<Heading level={1}>Events</Heading>}>
          <Text variant="body">All Hanabi events, past and present.</Text>

          {loading ? <Text variant="muted">Loading events…</Text> : null}
          {error ? <Alert variant="error" message={error ?? 'Unable to load events.'} /> : null}

          {!loading && !error ? (
            <Stack gap="lg">
              <Stack gap="sm">
                <Heading level={3}>Active</Heading>
                {activeEvents.length === 0 ? (
                  <Text variant="muted">No active events.</Text>
                ) : (
                  <Stack gap="sm">
                    {activeEvents.map((event) => (
                      <EventCard key={event.id} event={event} description="short" now={now} />
                    ))}
                  </Stack>
                )}
              </Stack>

              <Stack gap="sm">
                <Heading level={3}>Completed</Heading>
                {completedEvents.length === 0 ? (
                  <Text variant="muted">No completed events.</Text>
                ) : (
                  <Stack gap="sm">
                    {completedEvents.map((event) => (
                      <EventCard key={event.id} event={event} description="short" now={now} />
                    ))}
                  </Stack>
                )}
              </Stack>
            </Stack>
          ) : null}
        </Section>
      </PageContainer>
    </Main>
  );
};
