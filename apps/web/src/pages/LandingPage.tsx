import React, { useMemo } from 'react';
import { Link } from '../mantine';
import {
  Alert,
  Heading,
  Inline,
  PageContainer,
  Section,
  Stack,
  Text,
  Main,
} from '../design-system';
import { EventCard } from '../features/events';
import { useEvents } from '../hooks/useEvents';
import { usePublicContentPage } from './ContentPage';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';

export const LandingPage: React.FC = () => {
  const { events, loading, error } = useEvents();
  const { page: homePage } = usePublicContentPage('home');
  const [now] = React.useState(() => Date.now());
  const activeEvents = useMemo(() => {
    return events.filter((e) => {
      // Leagues (session_ladder) use status rather than date bounds
      if (e.event_format === 'session_ladder') {
        return e.event_status !== 'COMPLETE';
      }

      const start = e.starts_at ? new Date(e.starts_at).getTime() : null;
      const end = e.ends_at ? new Date(e.ends_at).getTime() : null;
      if (!start || !end) return false; // only time-bound events

      const regOpens = e.registration_opens_at
        ? new Date(e.registration_opens_at).getTime()
        : start;
      const cutoff = e.registration_cutoff ? new Date(e.registration_cutoff).getTime() : end;
      const regOpen = regOpens <= now;
      const regStillOpen = e.allow_late_registration || cutoff >= now;
      if (!regOpen || !regStillOpen) return false;

      // Keep if event not finished yet (or currently running) even if before start
      return now <= end;
    });
  }, [events, now]);

  const landingLimit = 3;
  const visibleActive = activeEvents.slice(0, landingLimit);

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" header={<Heading level={1}>Hanabi Competitions</Heading>}>
          {homePage && (
            <Section>
              <MarkdownRenderer markdown={homePage.markdown} />
            </Section>
          )}

          <Section header={<Heading level={2}>Ongoing Competitions</Heading>}>
            {loading && <Text variant="muted">Loading…</Text>}

            {error && <Alert variant="error" message={error ?? 'Unable to load events.'} />}

            {!loading && !error && activeEvents.length === 0 && (
              <Text variant="muted">
                No active events right now. Check out the <Link to="/events">events archive</Link>.
              </Text>
            )}

            {!loading && !error && activeEvents.length > 0 && (
              <Stack gap="sm">
                {visibleActive.map((event) => (
                  <EventCard key={event.id} event={event} description="short" now={now} />
                ))}
                <Inline>
                  <Link to="/events">See more events</Link>
                </Inline>
              </Stack>
            )}
          </Section>
        </Section>
      </PageContainer>
    </Main>
  );
};
