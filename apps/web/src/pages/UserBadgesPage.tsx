import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  CoreBox as Box,
  CoreButton as Button,
  Card,
  CoreGroup as Group,
  CoreImage as Image,
  CoreLoader as Loader,
  CoreModal as Modal,
  CoreStack as Stack,
  CoreText as Text,
  CoreTitle as Title,
  CoreUnstyledButton as UnstyledButton,
} from '../design-system';
import { ApiError } from '../lib/api';
import { UserPill } from '../features/users/UserPill';
import { buildSimulatedBadgeDataUri } from '../features/users/badgeSimulation';
import {
  fetchUserBadges,
  fetchUserProfile,
  isLargeBadge,
  type UserBadgeRecord,
  type UserProfileRecord,
} from '../features/users/userApi';

export function UserBadgesPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [badges, setBadges] = useState<UserBadgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<UserBadgeRecord | null>(null);

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
        const [profileValue, badgesValue] = await Promise.all([
          fetchUserProfile(username),
          fetchUserBadges(username),
        ]);
        if (cancelled) return;
        setProfile(profileValue);
        setBadges(badgesValue);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load badges');
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
            Loading badges...
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
        <Title order={2}>Badges</Title>
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

      {badges.length === 0 ? (
        <Card variant="outline">
          <Text size="sm" c="dimmed">
            No badges found for this user.
          </Text>
        </Card>
      ) : (
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
            gridAutoRows: '96px',
            gridAutoFlow: 'dense',
            gap: 12,
          }}
        >
          {badges.map((badge) => {
            const large = isLargeBadge(badge.rank);
            return (
              <UnstyledButton
                key={badge.id}
                style={{
                  gridColumn: `span ${large ? 2 : 1}`,
                  gridRow: `span ${large ? 2 : 1}`,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  minWidth: 0,
                  minHeight: 0,
                  border: 0,
                  background: 'transparent',
                }}
                onClick={() => setSelectedBadge(badge)}
                title={badge.name}
                aria-label={badge.name}
              >
                <Image
                  src={buildSimulatedBadgeDataUri(badge)}
                  alt=""
                  aria-hidden="true"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                />
              </UnstyledButton>
            );
          })}
        </Box>
      )}

      <Modal
        opened={Boolean(selectedBadge)}
        onClose={() => setSelectedBadge(null)}
        title={selectedBadge?.name ?? 'Badge'}
        centered
        styles={{
          content: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          },
          header: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          },
          body: {
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          },
        }}
      >
        {selectedBadge ? (
          <Stack gap="sm" align="center">
            <Image
              src={buildSimulatedBadgeDataUri(selectedBadge)}
              alt=""
              aria-hidden="true"
              style={{ width: 236, height: 236, objectFit: 'contain', display: 'block' }}
            />
            <Text size="sm" ta="center">
              {selectedBadge.description}
            </Text>
            <Text size="sm" c="dimmed">
              Event:{' '}
              <Link to={`/events/${selectedBadge.event_slug}`}>{selectedBadge.event_name}</Link>
            </Text>
            {selectedBadge.team_name && selectedBadge.team_id ? (
              <Text size="sm" c="dimmed">
                Team:{' '}
                <Link to={`/events/${selectedBadge.event_slug}/teams/${selectedBadge.team_id}`}>
                  {selectedBadge.team_name}
                </Link>
              </Text>
            ) : null}
            {selectedBadge.awarded_at ? (
              <Text size="xs" c="dimmed">
                Earned on {new Date(selectedBadge.awarded_at).toLocaleDateString()}
              </Text>
            ) : null}
          </Stack>
        ) : null}
      </Modal>
    </Stack>
  );
}
