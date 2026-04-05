import { Link } from '../../../mantine';
import {
  ActionIcon,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreImage as Image,
  CoreStack as Stack,
  CoreText as Text,
  CoreTooltip as Tooltip,
  CoreUnstyledButton as UnstyledButton,
} from '../../../design-system';
import { EventCard } from '../../events';
import { buildSimulatedBadgeDataUri } from '../badgeSimulation';
import type { AdminAccessRequestRecord } from '../../admin-access/adminAccessApi';
import type {
  UserAwardRecord,
  UserBadgeRecord,
  UserEventRecord,
  UserProfileRecord,
} from '../userApi';
import { MaterialIcon, Tabs as NavTabs } from '../../../design-system';

export type OwnTab = 'overview' | 'settings';

export function ProfileHeaderMeta(props: { profile: UserProfileRecord; displayName: string }) {
  const { profile, displayName } = props;
  return (
    <>
      <Text fw={700} size="1.75rem" lh={1.2}>
        {displayName}
      </Text>
      <Group gap="xs" wrap="wrap">
        {profile.roles.map((r) => (
          <Badge key={r} variant="light">
            {r}
          </Badge>
        ))}
        <Text size="sm" c="dimmed">
          Joined {new Date(profile.created_at).toLocaleDateString()}
        </Text>
        <Tooltip label="Hanab Live" withArrow>
          <ActionIcon
            component="a"
            href={`https://hanab.live/scores/${encodeURIComponent(displayName)}`}
            target="_blank"
            rel="noreferrer"
            variant="light"
            size="sm"
            aria-label="Open Hanab Live profile"
          >
            <MaterialIcon name="open_in_new" />
          </ActionIcon>
        </Tooltip>
      </Group>
    </>
  );
}

export function ProfileTabs(props: {
  isOwnProfile: boolean;
  activeTab: OwnTab;
  onOverview: () => void;
  onSettings: () => void;
}) {
  if (!props.isOwnProfile) return null;
  return (
    <NavTabs
      items={[
        {
          key: 'overview',
          label: 'Overview',
          active: props.activeTab === 'overview',
          onSelect: props.onOverview,
        },
        {
          key: 'settings',
          label: 'Settings',
          active: props.activeTab === 'settings',
          onSelect: props.onSettings,
        },
      ]}
    />
  );
}

export function OverviewSections(props: {
  displayName: string;
  previewEvents: UserEventRecord[];
  badges: UserBadgeRecord[];
  previewBadges: UserBadgeRecord[];
  awards: UserAwardRecord[];
  onSelectBadge: (badge: UserBadgeRecord) => void;
}) {
  const { displayName, previewEvents, badges, previewBadges, awards, onSelectBadge } = props;
  return (
    <Stack gap="sm">
      <Stack gap={8}>
        <Text
          fw={700}
          component={Link}
          to={`/users/${encodeURIComponent(displayName)}/events`}
          style={{ textDecoration: 'none' }}
        >
          Events
        </Text>
        {previewEvents.length === 0 ? (
          <Text size="sm" c="dimmed">
            No events yet.
          </Text>
        ) : (
          previewEvents.map((event) => (
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
                registration_opens_at: event.registration_opens_at,
                registration_cutoff: event.registration_cutoff,
                allow_late_registration: event.allow_late_registration,
              }}
              footer={
                <Text size="xs" c="dimmed">
                  {event.team_name}
                </Text>
              }
            />
          ))
        )}
      </Stack>

      <Stack gap={8}>
        <Text
          fw={700}
          component={Link}
          to={`/users/${encodeURIComponent(displayName)}/badges`}
          style={{ textDecoration: 'none' }}
        >
          Badges
        </Text>
        {previewBadges.length === 0 ? (
          <Text size="sm" c="dimmed">
            No badges yet.
          </Text>
        ) : (
          <Group gap={8} wrap="nowrap" style={{ overflowX: 'auto', paddingBottom: 2 }}>
            {previewBadges.map((badge) => (
              <UnstyledButton
                key={badge.id}
                style={{
                  width: 96,
                  height: 96,
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 auto',
                  border: 0,
                  background: 'transparent',
                  minWidth: 0,
                  minHeight: 0,
                }}
                title={badge.name}
                onClick={() => onSelectBadge(badge)}
                aria-label={badge.name}
              >
                <Image
                  src={buildSimulatedBadgeDataUri(badge)}
                  alt=""
                  aria-hidden="true"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
              </UnstyledButton>
            ))}
            {badges.length > previewBadges.length ? (
              <Text size="xs" c="dimmed" style={{ flex: '0 0 auto' }}>
                +{badges.length - previewBadges.length}
              </Text>
            ) : null}
          </Group>
        )}
      </Stack>

      {awards.length > 0 ? (
        <Stack gap={8}>
          <Text fw={700}>Awards</Text>
          <Stack gap={4}>
            {awards.map((award) => (
              <Group key={award.id} gap="xs" wrap="nowrap">
                {award.icon ? (
                  <Text size="lg" style={{ lineHeight: 1 }}>
                    {String.fromCodePoint(Number.parseInt(award.icon, 16))}
                  </Text>
                ) : null}
                <Stack gap={0}>
                  <Text size="sm" fw={500}>
                    {award.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    <Link to={`/events/${award.event_slug}`}>{award.event_name}</Link>
                    {award.stage_label ? ` — ${award.stage_label}` : ''}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}

export function SettingsSection(props: {
  roles: string[] | undefined;
  adminRequestStatus: AdminAccessRequestRecord | null;
  adminRequestLoading: boolean;
  onOpenPassword: () => void;
  onOpenAdminRequest: () => void;
}) {
  const { roles, adminRequestStatus, adminRequestLoading, onOpenPassword, onOpenAdminRequest } =
    props;
  const isBasicUser = !roles || roles.every((r) => r === 'USER');
  return (
    <Stack
      gap="sm"
      style={{ border: '1px solid var(--mantine-color-gray-3)', borderRadius: 8, padding: 16 }}
    >
      <Text fw={600}>Settings</Text>
      <Group gap="sm" wrap="wrap">
        <Button variant="light" onClick={onOpenPassword}>
          Change Password
        </Button>

        {isBasicUser ? (
          <Button
            variant="light"
            onClick={onOpenAdminRequest}
            disabled={adminRequestLoading || adminRequestStatus?.status === 'pending'}
          >
            Request Admin Access
          </Button>
        ) : null}
      </Group>

      {isBasicUser && adminRequestStatus?.status === 'pending' ? (
        <Text size="sm" c="dimmed">
          Admin access request pending since{' '}
          {new Date(adminRequestStatus.created_at).toLocaleDateString()}.
        </Text>
      ) : null}
      {isBasicUser && adminRequestStatus?.status === 'denied' ? (
        <Text size="sm" c="dimmed">
          Previous admin request was denied.
        </Text>
      ) : null}
      {isBasicUser && adminRequestStatus?.status === 'approved' ? (
        <Text size="sm" c="dimmed">
          Your admin request was approved.
        </Text>
      ) : null}
    </Stack>
  );
}
