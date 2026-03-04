import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Alert,
  CoreButton as Button,
  CoreGroup as Group,
  CoreImage as Image,
  CoreLoader as Loader,
  CoreModal as Modal,
  CorePasswordInput as PasswordInput,
  CoreTextarea as Textarea,
  CoreStack as Stack,
  CoreText as Text,
} from '../design-system';
import { ApiError, postJsonAuth } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  getMyAdminAccessRequestStatusAuth,
  submitAdminAccessRequestAuth,
  type AdminAccessRequestRecord,
} from '../features/admin-access/adminAccessApi';
import { buildSimulatedBadgeDataUri } from '../features/users/badgeSimulation';
import {
  fetchUserBadges,
  fetchUserEvents,
  fetchUserProfile,
  type UserBadgeRecord,
  type UserEventRecord,
  type UserProfileRecord,
} from '../features/users/userApi';
import { pickActiveEvents } from '../features/users/profile/profileUtils';
import {
  OverviewSections,
  ProfileHeaderMeta,
  ProfileTabs,
  SettingsSection,
  type OwnTab,
} from '../features/users/profile/ProfileSections';

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user: authUser, token } = useAuth();

  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [events, setEvents] = useState<UserEventRecord[]>([]);
  const [badges, setBadges] = useState<UserBadgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<UserBadgeRecord | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [adminRequestModalOpen, setAdminRequestModalOpen] = useState(false);
  const [adminRequestReason, setAdminRequestReason] = useState('');
  const [adminRequestStatus, setAdminRequestStatus] = useState<AdminAccessRequestRecord | null>(
    null,
  );
  const [adminRequestLoading, setAdminRequestLoading] = useState(false);
  const [submittingAdminRequest, setSubmittingAdminRequest] = useState(false);
  const [adminRequestError, setAdminRequestError] = useState<string | null>(null);
  const [adminRequestSuccess, setAdminRequestSuccess] = useState<string | null>(null);

  const displayName = username ?? 'Unknown';
  const isOwnProfile = Boolean(authUser && authUser.display_name === username);

  const activeTab: OwnTab = useMemo(() => {
    const raw = searchParams.get('tab');
    return raw === 'settings' ? 'settings' : 'overview';
  }, [searchParams]);

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
        const [profileValue, eventsValue, badgesValue] = await Promise.all([
          fetchUserProfile(username),
          fetchUserEvents(username),
          fetchUserBadges(username),
        ]);
        if (cancelled) return;
        setProfile(profileValue);
        setEvents(eventsValue);
        setBadges(badgesValue);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError('User not found');
        } else {
          setError('Failed to load user');
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

  const previewEvents = useMemo(() => pickActiveEvents(events), [events]);
  const previewBadges = useMemo(() => badges.slice(0, 10), [badges]);

  useEffect(() => {
    if (!isOwnProfile || !token) {
      setAdminRequestStatus(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setAdminRequestLoading(true);
      try {
        const status = await getMyAdminAccessRequestStatusAuth(token);
        if (!cancelled) setAdminRequestStatus(status);
      } catch {
        if (!cancelled) setAdminRequestStatus(null);
      } finally {
        if (!cancelled) setAdminRequestLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, token]);

  if (loading) {
    return (
      <Stack gap="md" py="md">
        <Group justify="center">
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            Loading user...
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

  const handlePasswordChange = async () => {
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!token) {
      setPasswordError('You are not logged in.');
      return;
    }
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('All password fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await postJsonAuth<{ ok: true }>('/auth/change-password', token, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated successfully.');
      setPasswordModalOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const message =
          typeof (err.body as { error?: unknown })?.error === 'string'
            ? ((err.body as { error: string }).error ?? null)
            : null;
        setPasswordError(message ?? 'Failed to update password.');
      } else {
        setPasswordError('Failed to update password.');
      }
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <Stack gap="md" py="md">
      <ProfileHeaderMeta profile={profile} displayName={displayName} />
      <ProfileTabs
        isOwnProfile={isOwnProfile}
        activeTab={activeTab}
        onOverview={() => setSearchParams({}, { replace: true })}
        onSettings={() => setSearchParams({ tab: 'settings' }, { replace: true })}
      />

      {!isOwnProfile || activeTab === 'overview' ? (
        <OverviewSections
          displayName={displayName}
          previewEvents={previewEvents}
          badges={badges}
          previewBadges={previewBadges}
          onSelectBadge={setSelectedBadge}
        />
      ) : null}

      {isOwnProfile && activeTab === 'settings' ? (
        <SettingsSection
          role={authUser?.role}
          adminRequestStatus={adminRequestStatus}
          adminRequestLoading={adminRequestLoading}
          onOpenPassword={() => {
            setPasswordError(null);
            setPasswordSuccess(null);
            setPasswordModalOpen(true);
          }}
          onOpenAdminRequest={() => {
            setAdminRequestError(null);
            setAdminRequestSuccess(null);
            setAdminRequestModalOpen(true);
          }}
        />
      ) : null}

      <Modal
        opened={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        title="Change Password"
        centered
      >
        <Stack gap="sm">
          {passwordError ? (
            <Alert color="red" variant="light">
              {passwordError}
            </Alert>
          ) : null}
          {passwordSuccess ? (
            <Alert color="green" variant="light">
              {passwordSuccess}
            </Alert>
          ) : null}

          <PasswordInput
            label="Current password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.currentTarget.value)}
            autoComplete="current-password"
          />
          <PasswordInput
            label="New password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.currentTarget.value)}
            autoComplete="new-password"
          />
          <PasswordInput
            label="Confirm new password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            autoComplete="new-password"
          />

          <Group justify="flex-end">
            <Button onClick={() => setPasswordModalOpen(false)} variant="default">
              Cancel
            </Button>
            <Button onClick={() => void handlePasswordChange()} loading={savingPassword}>
              Update password
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={adminRequestModalOpen && authUser?.role === 'USER'}
        onClose={() => setAdminRequestModalOpen(false)}
        title="Request Admin Access"
        centered
      >
        <Stack gap="sm">
          {adminRequestError ? (
            <Alert color="red" variant="light">
              {adminRequestError}
            </Alert>
          ) : null}
          {adminRequestSuccess ? (
            <Alert color="green" variant="light">
              {adminRequestSuccess}
            </Alert>
          ) : null}

          <Text size="sm" c="dimmed">
            Share a brief reason for admin access.
          </Text>
          <Textarea
            minRows={3}
            maxRows={6}
            value={adminRequestReason}
            onChange={(event) => setAdminRequestReason(event.currentTarget.value)}
            placeholder="Why do you need admin access?"
          />

          <Group justify="flex-end">
            <Button onClick={() => setAdminRequestModalOpen(false)} variant="default">
              Cancel
            </Button>
            <Button
              loading={submittingAdminRequest}
              onClick={() => {
                if (!token) {
                  setAdminRequestError('You must be logged in to submit a request.');
                  return;
                }
                setAdminRequestError(null);
                setAdminRequestSuccess(null);
                setSubmittingAdminRequest(true);
                void submitAdminAccessRequestAuth(
                  token,
                  adminRequestReason.trim() ? adminRequestReason.trim() : null,
                )
                  .then((request) => {
                    setAdminRequestStatus(request);
                    setAdminRequestSuccess('Admin access request submitted.');
                    setAdminRequestReason('');
                  })
                  .catch((err: unknown) => {
                    if (err instanceof ApiError) {
                      const message =
                        typeof (err.body as { error?: unknown })?.error === 'string'
                          ? ((err.body as { error: string }).error ?? null)
                          : null;
                      setAdminRequestError(message ?? 'Failed to submit admin access request.');
                    } else {
                      setAdminRequestError('Failed to submit admin access request.');
                    }
                  })
                  .finally(() => {
                    setSubmittingAdminRequest(false);
                  });
              }}
            >
              Submit Request
            </Button>
          </Group>
        </Stack>
      </Modal>

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
