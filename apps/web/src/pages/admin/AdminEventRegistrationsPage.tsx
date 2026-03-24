import { useEffect, useState } from 'react';
import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreDivider as Divider,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  SectionCard,
} from '../../design-system';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, deleteJsonAuth, getJsonAuth, patchJsonAuth } from '../../lib/api';

type RegistrationStatus = 'PENDING' | 'ACTIVE' | 'WITHDRAWN';

type Registration = {
  id: number;
  user_id: number;
  display_name: string;
  status: RegistrationStatus;
  registered_at: string;
};

type TeamMember = {
  user_id: number;
  display_name: string;
  confirmed: boolean;
};

type Team = {
  id: number;
  stage_id: number | null;
  team_size: number;
  source: string;
  display_name: string;
  members: TeamMember[];
  all_confirmed: boolean;
};

function statusColor(status: RegistrationStatus): string {
  switch (status) {
    case 'ACTIVE':
      return 'green';
    case 'PENDING':
      return 'yellow';
    case 'WITHDRAWN':
      return 'gray';
  }
}

function downloadCsv(registrations: Registration[], teamByUserId: Map<number, Team>) {
  const rows = [
    ['Display Name', 'Status', 'Registered At', 'Team'],
    ...registrations.map((r) => {
      const team = teamByUserId.get(r.user_id);
      const teamCell = team
        ? team.display_name
        : r.status === 'ACTIVE'
          ? 'Stage-scoped or none'
          : '—';
      return [r.display_name, r.status, new Date(r.registered_at).toISOString(), teamCell];
    }),
  ];
  const csv = rows.map((row) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'registrations.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminEventRegistrationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token } = useAuth();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [teamActionError, setTeamActionError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [regs, teamsData] = await Promise.all([
          getJsonAuth<Registration[]>(
            `/events/${encodeURIComponent(slug!)}/registrations`,
            token as string,
          ),
          getJsonAuth<Team[]>(`/events/${encodeURIComponent(slug!)}/teams`, token as string),
        ]);
        if (!cancelled) {
          setRegistrations(regs);
          setTeams(teamsData);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load registrations.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, token, version]);

  async function handleStatusChange(userId: number, newStatus: RegistrationStatus) {
    if (!token || !slug) return;
    setBusy(userId);
    setActionErrors((prev) => ({ ...prev, [userId]: '' }));
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/registrations/${userId}`, token, {
        status: newStatus,
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setActionErrors((prev) => ({
        ...prev,
        [userId]:
          err instanceof ApiError
            ? ((err.body as { error?: string })?.error ?? 'Failed to update.')
            : 'Failed to update.',
      }));
    } finally {
      setBusy(null);
    }
  }

  async function handleRemoveMember(teamId: number, userId: number) {
    if (!token || !slug) return;
    setTeamActionError(null);
    try {
      await deleteJsonAuth(
        `/events/${encodeURIComponent(slug)}/teams/${teamId}/members/${userId}`,
        token,
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setTeamActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to remove member.')
          : 'Failed to remove member.',
      );
    }
  }

  async function handleDissolveTeam(team: Team) {
    if (!token || !slug) return;
    if (!confirm(`Dissolve team "${team.display_name}"? This cannot be undone.`)) return;
    setTeamActionError(null);
    try {
      for (const member of team.members) {
        await deleteJsonAuth(
          `/events/${encodeURIComponent(slug)}/teams/${team.id}/members/${member.user_id}`,
          token,
        );
      }
      setVersion((v) => v + 1);
    } catch (err) {
      setTeamActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to dissolve team.')
          : 'Failed to dissolve team.',
      );
      setVersion((v) => v + 1);
    }
  }

  // Build EVENT-scope team lookup by user_id (stage_id === null)
  const eventTeamByUserId = new Map<number, Team>();
  for (const team of teams) {
    if (team.stage_id === null) {
      for (const member of team.members) {
        eventTeamByUserId.set(member.user_id, team);
      }
    }
  }

  if (loading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (loadError) {
    return (
      <Alert color="red" variant="light">
        {loadError}
      </Alert>
    );
  }

  const counts = {
    active: registrations.filter((r) => r.status === 'ACTIVE').length,
    pending: registrations.filter((r) => r.status === 'PENDING').length,
    withdrawn: registrations.filter((r) => r.status === 'WITHDRAWN').length,
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Group gap="md">
          <Text fw={600} size="sm">
            Registrations ({registrations.length})
          </Text>
          <Group gap="xs">
            <Badge color="green" variant="light" size="sm">
              {counts.active} active
            </Badge>
            {counts.pending > 0 ? (
              <Badge color="yellow" variant="light" size="sm">
                {counts.pending} pending
              </Badge>
            ) : null}
            {counts.withdrawn > 0 ? (
              <Badge color="gray" variant="light" size="sm">
                {counts.withdrawn} withdrawn
              </Badge>
            ) : null}
          </Group>
        </Group>
        <Button
          variant="default"
          size="sm"
          disabled={registrations.length === 0}
          onClick={() => downloadCsv(registrations, eventTeamByUserId)}
        >
          Export CSV
        </Button>
      </Group>

      {registrations.length === 0 ? (
        <Text c="dimmed" size="sm">
          No registrations yet.
        </Text>
      ) : (
        registrations.map((reg) => {
          const team = eventTeamByUserId.get(reg.user_id);
          const teamDisplay = team ? team.display_name : reg.status === 'ACTIVE' ? 'No team' : '—';

          return (
            <SectionCard key={reg.id}>
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Text fw={600} size="sm">
                        {reg.display_name}
                      </Text>
                      <Badge color={statusColor(reg.status)} variant="light" size="sm">
                        {reg.status}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      Registered {new Date(reg.registered_at).toLocaleDateString()} · Team:{' '}
                      {teamDisplay}
                    </Text>
                  </Stack>

                  <Group gap="xs">
                    {reg.status === 'PENDING' ? (
                      <Button
                        size="xs"
                        color="green"
                        variant="light"
                        loading={busy === reg.user_id}
                        onClick={() => void handleStatusChange(reg.user_id, 'ACTIVE')}
                      >
                        Approve
                      </Button>
                    ) : null}
                    {reg.status === 'ACTIVE' ? (
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        loading={busy === reg.user_id}
                        onClick={() => void handleStatusChange(reg.user_id, 'WITHDRAWN')}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                    {reg.status === 'WITHDRAWN' ? (
                      <Button
                        size="xs"
                        color="blue"
                        variant="light"
                        loading={busy === reg.user_id}
                        onClick={() => void handleStatusChange(reg.user_id, 'ACTIVE')}
                      >
                        Reinstate
                      </Button>
                    ) : null}
                  </Group>
                </Group>

                {actionErrors[reg.user_id] ? (
                  <Alert color="red" variant="light">
                    {actionErrors[reg.user_id]}
                  </Alert>
                ) : null}

                {/* EVENT-scope team members */}
                {team ? (
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      Team members:
                    </Text>
                    {team.members.map((m) => (
                      <Badge
                        key={m.user_id}
                        variant={m.confirmed ? 'light' : 'outline'}
                        color={m.confirmed ? 'blue' : 'gray'}
                        size="xs"
                      >
                        {m.display_name}
                        {!m.confirmed ? ' (pending)' : ''}
                      </Badge>
                    ))}
                  </Group>
                ) : null}
              </Stack>
            </SectionCard>
          );
        })
      )}

      {/* Teams section (T-051) */}
      {teams.length > 0 ? (
        <>
          <Divider />

          <Text fw={600} size="sm">
            Teams ({teams.length})
          </Text>

          {teamActionError ? (
            <Alert color="red" variant="light">
              {teamActionError}
            </Alert>
          ) : null}

          {/* EVENT-scope teams */}
          {teams.filter((t) => t.stage_id === null).length > 0 ? (
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={600}>
                EVENT-SCOPED
              </Text>
              {teams
                .filter((t) => t.stage_id === null)
                .map((team) => (
                  <SectionCard key={team.id}>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Group gap="xs">
                            <Text fw={600} size="sm">
                              {team.display_name}
                            </Text>
                            <Badge variant="light" size="xs" color="gray">
                              {team.source}
                            </Badge>
                            {team.all_confirmed ? (
                              <Badge variant="light" size="xs" color="green">
                                Confirmed
                              </Badge>
                            ) : (
                              <Badge variant="light" size="xs" color="yellow">
                                Pending
                              </Badge>
                            )}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {team.team_size}p team
                          </Text>
                        </Stack>
                        <Button
                          size="xs"
                          variant="outline"
                          color="red"
                          onClick={() => void handleDissolveTeam(team)}
                        >
                          Dissolve
                        </Button>
                      </Group>
                      <Group gap="xs">
                        {team.members.map((m) => (
                          <Group key={m.user_id} gap={4}>
                            <Badge
                              variant={m.confirmed ? 'light' : 'outline'}
                              color={m.confirmed ? 'blue' : 'gray'}
                              size="xs"
                            >
                              {m.display_name}
                              {!m.confirmed ? ' (pending)' : ''}
                            </Badge>
                            <Button
                              size="xs"
                              variant="subtle"
                              color="red"
                              onClick={() => void handleRemoveMember(team.id, m.user_id)}
                            >
                              ×
                            </Button>
                          </Group>
                        ))}
                      </Group>
                    </Stack>
                  </SectionCard>
                ))}
            </Stack>
          ) : null}

          {/* STAGE-scope teams */}
          {teams.filter((t) => t.stage_id !== null).length > 0 ? (
            <Stack gap="xs">
              <Text size="xs" c="dimmed" fw={600}>
                STAGE-SCOPED
              </Text>
              {teams
                .filter((t) => t.stage_id !== null)
                .map((team) => (
                  <SectionCard key={team.id}>
                    <Group justify="space-between">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text fw={600} size="sm">
                            {team.display_name}
                          </Text>
                          <Badge variant="light" size="xs" color="gray">
                            {team.source}
                          </Badge>
                          <Badge variant="light" size="xs" color="violet">
                            Stage {team.stage_id}
                          </Badge>
                        </Group>
                        <Group gap={4}>
                          {team.members.map((m) => (
                            <Badge
                              key={m.user_id}
                              variant="light"
                              size="xs"
                              color={m.confirmed ? 'blue' : 'gray'}
                            >
                              {m.display_name}
                            </Badge>
                          ))}
                        </Group>
                      </Stack>
                    </Group>
                  </SectionCard>
                ))}
            </Stack>
          ) : null}
        </>
      ) : null}
    </Stack>
  );
}
