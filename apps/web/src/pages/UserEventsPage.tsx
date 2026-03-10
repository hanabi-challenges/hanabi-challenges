import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Link } from '../mantine';
import {
  Alert,
  CoreButton as Button,
  Card,
  CoreGroup as Group,
  CoreLoader as Loader,
  CoreStack as Stack,
  CoreText as Text,
  CoreTitle as Title,
} from '../design-system';
import { ApiError } from '../lib/api';
import { UserPill } from '../features/users/UserPill';
import { EventCard } from '../features/events';
import {
  fetchUserEvents,
  fetchUserProfile,
  type UserEventRecord,
  type UserProfileRecord,
} from '../features/users/userApi';

export function UserEventsPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [events, setEvents] = useState<UserEventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!username) {
      setLoading(false);
      setError('No username provided');
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [profileValue, eventsValue] = await Promise.all([
          fetchUserProfile(username),
          fetchUserEvents(username),
        ]);
        if (cancelled) return;
        setProfile(profileValue);
        setEvents(eventsValue);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load events');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [username]);

  if (loading) {
    return (
      <Stack gap="md" py="md">
        <Group justify="center">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            Loading events...
          </Text>
        </Group>
      </Stack>
    );
  }

  if (!profile || error) {
    return (
      <Stack gap="md" py="md">
        <Alert color="red" variant="light">
          {error ?? 'User not found'}
        </Alert>
        <Group>
          <Button onClick={() => navigate('/')}>Go home</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md" py="md">
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>Events</Title>
        <Button
          component={Link}
          to={`/users/${encodeURIComponent(profile.display_name)}`}
          variant="subtle"
          px={0}
          styles={{ root: { height: 'auto' } }}
          aria-label={`Back to ${profile.display_name} profile`}
        >
          <UserPill
            name={profile.display_name}
            color={profile.color_hex ?? '#777777'}
            textColor={profile.text_color ?? '#ffffff'}
          />
        </Button>
      </Group>

      {events.length === 0 ? (
        <Card variant="outline">
          <Text size="sm" c="dimmed">
            No events found for this user.
          </Text>
        </Card>
      ) : (
        events.map((event) => (
          <EventCard
            key={event.event_team_id}
            description="short"
            event={{
              slug: event.event_slug,
              name: event.event_name,
              short_description: event.short_description,
              long_description: event.long_description,
              starts_at: event.starts_at,
              ends_at: event.ends_at,
              event_format: event.event_format,
              event_status: event.event_status,
            }}
            footer={
              <Stack gap={2}>
                <Text size="sm">Team: {event.team_name}</Text>
                <Text size="xs" c="dimmed">
                  Team size: {event.team_size}
                </Text>
              </Stack>
            }
          />
        ))
      )}
    </Stack>
  );
}
