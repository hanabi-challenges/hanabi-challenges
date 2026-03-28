import { useState, useEffect, useCallback } from 'react';
import {
  Container,
  Title,
  Table,
  Badge,
  Group,
  Select,
  Button,
  Alert,
  Text,
  Loader,
  Center,
} from '@mantine/core';
import { api, ApiError } from '../api.js';

interface UserRow {
  id: string;
  hanablive_username: string;
  display_name: string;
  role: string;
  discord_linked: boolean;
}

const ROLE_COLOR: Record<string, string> = {
  committee: 'violet',
  moderator: 'blue',
  community_member: 'gray',
};

export function AdminUsersPage({ currentUserId }: { currentUserId?: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const data = await api.listUsers();
      setUsers(data.users);
      setError(null);
    } catch {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAssign(userId: string) {
    const role = assignTarget[userId];
    if (!role) return;
    setPending(userId);
    setActionError(null);
    try {
      await api.assignRole(userId, role as 'moderator' | 'committee');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to assign role.');
    } finally {
      setPending(null);
    }
  }

  async function handleRevoke(userId: string, roleSlug: string) {
    setPending(userId);
    setActionError(null);
    try {
      const res = await api.revokeRole(userId, roleSlug);
      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to revoke role.');
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <Center mt="xl">
        <Loader />
      </Center>
    );
  }

  if (error) {
    return (
      <Container mt="md">
        <Alert color="red">{error}</Alert>
      </Container>
    );
  }

  const committeeCount = users.filter((u) => u.role === 'committee').length;

  return (
    <Container mt="md">
      <Title order={2} mb="md">
        Role Management
      </Title>

      {actionError && (
        <Alert color="red" mb="md">
          {actionError}
        </Alert>
      )}

      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Username</Table.Th>
            <Table.Th>Current Role</Table.Th>
            <Table.Th>Discord</Table.Th>
            <Table.Th>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {users.map((user) => {
            const isOwnAccount = user.id === currentUserId;
            const isLastCommittee = user.role === 'committee' && committeeCount <= 1;
            const canRevoke = !isOwnAccount && !isLastCommittee && user.role !== 'community_member';
            const isLoading = pending === user.id;

            return (
              <Table.Tr key={user.id}>
                <Table.Td>
                  <Text fw={500}>{user.display_name}</Text>
                  <Text size="xs" c="dimmed">
                    {user.hanablive_username}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={ROLE_COLOR[user.role] ?? 'gray'}>{user.role}</Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={user.discord_linked ? 'green' : 'gray'} variant="outline">
                    {user.discord_linked ? 'Linked' : 'Unlinked'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Select
                      size="xs"
                      placeholder="Assign role…"
                      data={[
                        { value: 'moderator', label: 'Moderator' },
                        { value: 'committee', label: 'Committee' },
                      ]}
                      value={assignTarget[user.id] ?? null}
                      onChange={(v) => setAssignTarget((prev) => ({ ...prev, [user.id]: v ?? '' }))}
                      w={140}
                    />
                    <Button
                      size="xs"
                      disabled={!assignTarget[user.id] || isLoading}
                      loading={isLoading}
                      onClick={() => void handleAssign(user.id)}
                    >
                      Assign
                    </Button>
                    {canRevoke && (
                      <Button
                        size="xs"
                        color="red"
                        variant="outline"
                        loading={isLoading}
                        onClick={() => void handleRevoke(user.id, user.role)}
                      >
                        Revoke
                      </Button>
                    )}
                    {isOwnAccount && (
                      <Text size="xs" c="dimmed">
                        (your account)
                      </Text>
                    )}
                    {isLastCommittee && !isOwnAccount && (
                      <Text size="xs" c="dimmed">
                        (last committee)
                      </Text>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Container>
  );
}
