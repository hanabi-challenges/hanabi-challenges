import { useMemo, useState } from 'react';
import {
  Alert,
  CoreBox as Box,
  CoreButton as Button,
  SectionCard,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreCheckbox as Checkbox,
} from '../../design-system';
import { useAuth } from '../../context/AuthContext';
import { useUsers, type UserSummary } from '../../hooks/useUsers';
import { ApiError, postJsonAuth } from '../../lib/api';
import { UserPill } from '../../features/users/UserPill';

const ASSIGNABLE_ROLES = ['HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN'] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function AdminManageUsersPage() {
  const { user, token } = useAuth();
  const { users, error, refetch } = useUsers();

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updatingById, setUpdatingById] = useState<Record<number, boolean>>({});
  const [rolesOverrides, setRolesOverrides] = useState<Record<number, string[]>>({});

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [] as UserSummary[];
    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => u.display_name.toLowerCase().includes(term))
      .slice(0, 8);
  }, [query, users, user?.id]);

  const candidateUsers = useMemo(() => {
    if (selectedId != null) {
      const selected = users.find((u) => u.id === selectedId);
      return selected ? [selected] : [];
    }

    const term = query.trim().toLowerCase();
    if (!term) return [];

    return users
      .filter((u) => u.id !== user?.id)
      .filter((u) => u.display_name.toLowerCase().includes(term))
      .slice(0, 25);
  }, [selectedId, query, users, user?.id]);

  async function handleRoleToggle(targetUser: UserSummary, role: AssignableRole, checked: boolean) {
    if (!token) return;

    setStatusMessage(null);
    setStatusError(null);
    setUpdatingById((prev) => ({ ...prev, [targetUser.id]: true }));

    try {
      const result = await postJsonAuth<{ id: number; roles: string[] }>(
        `/users/${targetUser.id}/roles`,
        token,
        { role, action: checked ? 'add' : 'remove' },
      );
      setStatusMessage(
        `Updated ${targetUser.display_name}: ${result.roles.filter((r) => r !== 'USER').join(', ') || 'USER only'}.`,
      );
      setRolesOverrides((prev) => ({ ...prev, [targetUser.id]: result.roles }));
      refetch();
    } catch (err) {
      if (err instanceof ApiError) {
        setStatusError((err.body as { error?: string })?.error ?? 'Failed to update roles');
      } else {
        setStatusError('Failed to update roles');
      }
    } finally {
      setUpdatingById((prev) => ({ ...prev, [targetUser.id]: false }));
    }
  }

  return (
    <Stack gap="md">
      <Text c="dimmed" size="sm">
        Search users and manage role access. You cannot change your own roles.
      </Text>

      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}
      {statusMessage ? (
        <Alert color="green" variant="light">
          {statusMessage}
        </Alert>
      ) : null}
      {statusError ? (
        <Alert color="red" variant="light">
          {statusError}
        </Alert>
      ) : null}

      <SectionCard>
        <Stack gap="sm">
          <Text fw={600}>Find user</Text>
          <TextInput
            placeholder="Type a username"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedId(null);
              setStatusMessage(null);
              setStatusError(null);
            }}
          />

          {selectedId == null && suggestions.length > 0 ? (
            <Group gap="xs" wrap="wrap">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  variant="light"
                  size="xs"
                  onClick={() => {
                    setSelectedId(suggestion.id);
                    setQuery(suggestion.display_name);
                    setStatusMessage(null);
                    setStatusError(null);
                  }}
                >
                  {suggestion.display_name}
                </Button>
              ))}
            </Group>
          ) : null}
        </Stack>
      </SectionCard>

      {candidateUsers.length === 0 ? (
        <Text c="dimmed" size="sm">
          Enter a username to search.
        </Text>
      ) : (
        <Stack gap="sm">
          {candidateUsers.map((candidate) => {
            const busy = Boolean(updatingById[candidate.id]);
            const currentRoles = rolesOverrides[candidate.id] ?? candidate.roles;
            return (
              <SectionCard key={candidate.id}>
                <Group justify="space-between" align="flex-start" wrap="wrap">
                  <Box>
                    <UserPill
                      name={candidate.display_name}
                      color={candidate.color_hex || '#777777'}
                      textColor={candidate.text_color || '#ffffff'}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      {currentRoles.join(', ')}
                    </Text>
                  </Box>

                  <Group gap="sm" wrap="wrap">
                    {ASSIGNABLE_ROLES.map((role) => (
                      <Checkbox
                        key={role}
                        label={role}
                        checked={currentRoles.includes(role)}
                        disabled={busy}
                        onChange={(e) =>
                          void handleRoleToggle(candidate, role, e.currentTarget.checked)
                        }
                      />
                    ))}
                  </Group>
                </Group>
              </SectionCard>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
