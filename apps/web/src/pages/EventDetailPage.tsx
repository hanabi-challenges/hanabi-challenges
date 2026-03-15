import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  Main,
  PageContainer,
  Pill,
  SearchSelect,
  Section,
  Select,
  Stack,
  Tabs,
  Text,
  CoreTable as Table,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { ApiError, getJson, getJsonAuth, postJsonAuth } from '../lib/api';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import type { EventSummary } from '../hooks/useEvents';
import { useUserDirectory, type UserDirectoryEntry } from '../hooks/useUserDirectory';
import { UserPill } from '../features/users/UserPill';
import { NotFoundPage } from './NotFoundPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RegistrationRow = {
  id: number;
  status: 'PENDING' | 'ACTIVE' | 'WITHDRAWN';
};

type TeamMember = {
  user_id: number;
  display_name: string;
  confirmed: boolean;
};

type TeamResponse = {
  id: number;
  stage_id: number | null;
  display_name: string;
  members: TeamMember[];
  all_confirmed: boolean;
};

type PlayerStageScore = {
  stage_id: number;
  stage_label: string;
  score: number;
};

type AggregateEntry = {
  rank: number;
  user: { id: number; display_name: string };
  total_score: number;
  stage_scores: PlayerStageScore[];
};

type StageSummary = {
  id: number;
  label: string;
  mechanism: 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
  team_scope: 'EVENT' | 'STAGE';
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  team_count: number;
};

type AwardRow = {
  id: number;
  stage_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: string;
  attribution: 'INDIVIDUAL' | 'TEAM';
  sort_order: number;
};

type GroupedAwardsResponse = {
  event_awards: AwardRow[];
  stage_awards: { stage_id: number; stage_label: string; awards: AwardRow[] }[];
};

type AwardGrant = {
  id: number;
  award_id: number;
  user_id: number;
  event_team_id: number | null;
  granted_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function statusBannerText(event: EventSummary): string | null {
  switch (event.status) {
    case 'REGISTRATION_OPEN':
      return event.registration_cutoff
        ? `Registration Open — closes ${formatDate(event.registration_cutoff)}`
        : 'Registration Open';
    case 'IN_PROGRESS':
    case 'LIVE':
      return event.ends_at ? `In Progress — ends ${formatDate(event.ends_at)}` : 'In Progress';
    case 'UPCOMING':
      return event.starts_at ? `Upcoming — starts ${formatDate(event.starts_at)}` : 'Upcoming';
    case 'COMPLETE':
      return 'Completed';
    case 'ANNOUNCED':
      return 'Announced';
    default:
      return null;
  }
}

function statusBannerVariant(event: EventSummary): 'default' | 'accent' {
  return event.status === 'REGISTRATION_OPEN' ||
    event.status === 'IN_PROGRESS' ||
    event.status === 'LIVE'
    ? 'accent'
    : 'default';
}

function mechanismLabel(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'Leaderboard';
    case 'GAUNTLET':
      return 'Gauntlet';
    case 'MATCH_PLAY':
      return 'Match Play';
    default:
      return mechanism;
  }
}

function isRegistrationOpen(event: EventSummary): boolean {
  return (
    event.status === 'REGISTRATION_OPEN' ||
    (event.status === 'IN_PROGRESS' && event.allow_late_registration)
  );
}

function stageDateRange(stage: StageSummary): string | null {
  if (stage.starts_at && stage.ends_at) {
    return `${formatDate(stage.starts_at)} — ${formatDate(stage.ends_at)}`;
  }
  if (stage.starts_at) return `Starts ${formatDate(stage.starts_at)}`;
  if (stage.ends_at) return `Ends ${formatDate(stage.ends_at)}`;
  return null;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Public data
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [leaderboard, setLeaderboard] = useState<AggregateEntry[]>([]);
  const [awards, setAwards] = useState<GroupedAwardsResponse | null>(null);
  const [grantsByAward, setGrantsByAward] = useState<Map<number, AwardGrant[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auth data
  const [registration, setRegistration] = useState<RegistrationRow | null>(null);
  const [myTeams, setMyTeams] = useState<TeamResponse[]>([]);
  const [version, setVersion] = useState(0);

  // Register action
  const [registerBusy, setRegisterBusy] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Team formation (EVENT scope)
  const { users: allUsers } = useUserDirectory();
  const [teamSize, setTeamSize] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partners, setPartners] = useState<UserDirectoryEntry[]>([]);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Load public data
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      try {
        const [eventData, stagesData, lbData, awardsData] = await Promise.all([
          getJson<EventSummary>(`/events/${encodeURIComponent(slug!)}`),
          getJson<StageSummary[]>(`/events/${encodeURIComponent(slug!)}/stages`),
          getJson<{ entries: AggregateEntry[] }>(
            `/events/${encodeURIComponent(slug!)}/leaderboard`,
          ).catch(() => ({ entries: [] as AggregateEntry[] })),
          getJson<GroupedAwardsResponse>(`/events/${encodeURIComponent(slug!)}/awards`).catch(
            () => null,
          ),
        ]);
        if (!cancelled) {
          setEvent(eventData);
          setStages(stagesData);
          setLeaderboard(lbData.entries);
          setAwards(awardsData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true);
          } else {
            setLoadError('Failed to load event.');
          }
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Load auth data
  useEffect(() => {
    if (!slug || !token) return;
    let cancelled = false;

    async function loadAuth() {
      try {
        const [regData, teamsData] = await Promise.all([
          getJsonAuth<RegistrationRow>(
            `/events/${encodeURIComponent(slug!)}/registrations/me`,
            token as string,
          ).catch((err) => {
            if (err instanceof ApiError && err.status === 404) return null;
            return null;
          }),
          getJsonAuth<TeamResponse[]>(
            `/events/${encodeURIComponent(slug!)}/teams`,
            token as string,
          ).catch(() => [] as TeamResponse[]),
        ]);
        if (!cancelled) {
          setRegistration(regData);
          setMyTeams(teamsData);
        }
      } catch {
        // silently ignore
      }
    }

    loadAuth();
    return () => {
      cancelled = true;
    };
  }, [slug, token, version]);

  // Load grants when awards tab is active
  useEffect(() => {
    if (!slug || activeTab !== 'awards' || !awards) return;
    let cancelled = false;

    const allAwards = [...awards.event_awards, ...awards.stage_awards.flatMap((sg) => sg.awards)];

    async function loadGrants() {
      const results = await Promise.all(
        allAwards.map((a) =>
          getJson<AwardGrant[]>(`/events/${encodeURIComponent(slug!)}/awards/${a.id}/grants`).catch(
            () => [] as AwardGrant[],
          ),
        ),
      );
      if (cancelled) return;
      const map = new Map<number, AwardGrant[]>();
      allAwards.forEach((a, i) => {
        map.set(a.id, results[i]);
      });
      setGrantsByAward(map);
    }

    void loadGrants();
    return () => {
      cancelled = true;
    };
  }, [slug, activeTab, awards]);

  async function handleRegister() {
    if (!slug || !token) return;
    setRegisterBusy(true);
    setRegisterError(null);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/register`, token as string, {});
      setVersion((v) => v + 1);
    } catch (err) {
      setRegisterError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Registration failed.')
          : 'Registration failed.',
      );
    } finally {
      setRegisterBusy(false);
    }
  }

  async function handleCreateTeam() {
    if (!slug || !token || !teamSize) return;
    setTeamBusy(true);
    setTeamError(null);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/teams`, token as string, {
        invite_user_ids: partners.map((p) => p.id),
      });
      setTeamSize('');
      setPartners([]);
      setPartnerSearch('');
      setVersion((v) => v + 1);
    } catch (err) {
      setTeamError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Team creation failed.')
          : 'Team creation failed.',
      );
    } finally {
      setTeamBusy(false);
    }
  }

  if (loading) {
    return (
      <Main>
        <PageContainer>
          <Text variant="muted">Loading…</Text>
        </PageContainer>
      </Main>
    );
  }

  if (notFound) {
    return <NotFoundPage />;
  }

  if (loadError || !event) {
    return (
      <Main>
        <PageContainer>
          <Alert variant="error" message={loadError ?? 'Failed to load event.'} />
        </PageContainer>
      </Main>
    );
  }

  // Derived state
  const bannerText = statusBannerText(event);
  const regOpen = isRegistrationOpen(event);
  const confirmedTeam = myTeams.find((t) => t.stage_id === null && t.all_confirmed) ?? null;
  const pendingTeam = myTeams.find((t) => t.stage_id === null && !t.all_confirmed) ?? null;
  const showLeaderboard = leaderboard.length > 0;
  const eventTeamScope: 'EVENT' | 'STAGE' = stages.some((s) => s.team_scope === 'EVENT')
    ? 'EVENT'
    : 'STAGE';

  // Team size options for formation (EVENT scope)
  const teamSizeOptions = event.allowed_team_sizes.map((s) => ({
    value: String(s),
    label: s === 1 ? 'Solo' : `${s}-player`,
  }));
  const selectedTeamSize = teamSize ? Number(teamSize) : null;
  const partnersNeeded = selectedTeamSize ? selectedTeamSize - 1 : 0;
  const partnerSuggestions = allUsers
    .filter((u) => u.id !== user?.id && !partners.some((p) => p.id === u.id))
    .filter((u) => u.display_name.toLowerCase().includes(partnerSearch.toLowerCase()))
    .map((u) => ({
      key: u.id,
      value: u,
      node: <UserPill name={u.display_name} color={u.color_hex} textColor={u.text_color} />,
    }));

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      active: activeTab === 'overview',
      onSelect: () => setActiveTab('overview'),
    },
    {
      key: 'register',
      label: 'Register',
      active: activeTab === 'register',
      onSelect: () => setActiveTab('register'),
    },
    {
      key: 'stages',
      label: `Stages${stages.length > 0 ? ` (${stages.length})` : ''}`,
      active: activeTab === 'stages',
      onSelect: () => setActiveTab('stages'),
      disabled: stages.length === 0,
    },
    ...(showLeaderboard
      ? [
          {
            key: 'leaderboard',
            label: 'Leaderboard',
            active: activeTab === 'leaderboard',
            onSelect: () => setActiveTab('leaderboard'),
          },
        ]
      : []),
    ...((awards?.event_awards.length ?? 0) + (awards?.stage_awards.length ?? 0) > 0
      ? [
          {
            key: 'awards',
            label: 'Awards',
            active: activeTab === 'awards',
            onSelect: () => setActiveTab('awards'),
          },
        ]
      : []),
  ];

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          {/* Header */}
          <Stack gap="sm">
            <Heading level={1}>{event.name}</Heading>
            <Inline gap="xs" wrap>
              {bannerText ? (
                <Pill size="sm" variant={statusBannerVariant(event)}>
                  {bannerText}
                </Pill>
              ) : null}
              {event.allowed_team_sizes.map((size) => (
                <Pill key={size} size="sm" variant="default">
                  {size === 1 ? 'Solo' : `${size}-player`}
                </Pill>
              ))}
            </Inline>
          </Stack>

          {/* Tabs */}
          <Tabs items={tabItems} />

          {/* Tab content */}
          {activeTab === 'overview' ? (
            <Stack gap="md">
              <MarkdownRenderer markdown={event.long_description} />
            </Stack>
          ) : null}

          {activeTab === 'register' ? (
            <Stack gap="sm">
              <Heading level={3}>Registration</Heading>
              {registerError ? <Alert variant="error" message={registerError} /> : null}
              {!user ? (
                <Text variant="muted">Log in to register for this event.</Text>
              ) : registration?.status === 'ACTIVE' ? (
                confirmedTeam ? (
                  /* Registered + confirmed team */
                  <Stack gap="xs">
                    <Text variant="body">
                      You are registered with team: <strong>{confirmedTeam.display_name}</strong>
                    </Text>
                    <Inline gap="xs" wrap>
                      {confirmedTeam.members.map((m) => (
                        <Pill key={m.user_id} size="sm" variant="default">
                          {m.display_name}
                        </Pill>
                      ))}
                    </Inline>
                  </Stack>
                ) : pendingTeam ? (
                  /* Registered + pending team confirmation */
                  <Stack gap="xs">
                    <Text variant="body">You are registered — team pending confirmation.</Text>
                    <Text variant="muted">
                      Waiting for all members of {pendingTeam.display_name} to confirm.
                    </Text>
                  </Stack>
                ) : eventTeamScope === 'STAGE' ? (
                  /* Registered, STAGE scope — no team needed yet */
                  <Text variant="body">
                    You are registered. Form a team for each stage when it begins.
                  </Text>
                ) : (
                  /* Registered, EVENT scope — team formation flow */
                  <Stack gap="sm">
                    <Text variant="body">You are registered. Set up your team below.</Text>
                    {teamError ? <Alert variant="error" message={teamError} /> : null}

                    {/* Step 1: select team size (skip if only one option) */}
                    {teamSizeOptions.length > 1 ? (
                      <Stack gap="xs">
                        <Text variant="label">Team size</Text>
                        <Select
                          options={teamSizeOptions}
                          value={teamSize}
                          onChange={(v) => {
                            setTeamSize(v);
                            setPartners([]);
                            setPartnerSearch('');
                          }}
                          placeholder="Select team size…"
                        />
                      </Stack>
                    ) : teamSizeOptions.length === 1 && !teamSize ? (
                      /* Auto-select the only size */
                      (() => {
                        setTeamSize(teamSizeOptions[0].value);
                        return null;
                      })()
                    ) : null}

                    {/* Step 2: partner search (only if team size > 1 and size selected) */}
                    {selectedTeamSize && selectedTeamSize > 1 ? (
                      <Stack gap="xs">
                        <Text variant="label">
                          Invite partner{partnersNeeded > 1 ? 's' : ''} ({partners.length}/
                          {partnersNeeded} selected)
                        </Text>
                        <SearchSelect
                          value={partnerSearch}
                          onChange={setPartnerSearch}
                          suggestions={partnerSuggestions}
                          onSelect={(u) => {
                            setPartners((prev) => [...prev, u]);
                            setPartnerSearch('');
                          }}
                          blurOnSelect
                          maxSelections={partnersNeeded}
                          selectedCount={partners.length}
                          placeholder="Search by name…"
                          tokens={partners.map((p) => (
                            <UserPill
                              key={p.id}
                              name={p.display_name}
                              color={p.color_hex}
                              textColor={p.text_color}
                              trailingIcon={<span>×</span>}
                              onClick={() =>
                                setPartners((prev) => prev.filter((x) => x.id !== p.id))
                              }
                            />
                          ))}
                        />
                      </Stack>
                    ) : null}

                    {/* Submit */}
                    {selectedTeamSize ? (
                      <Button
                        size="sm"
                        onClick={() => void handleCreateTeam()}
                        disabled={
                          teamBusy || (selectedTeamSize > 1 && partners.length < partnersNeeded)
                        }
                      >
                        {teamBusy
                          ? 'Creating team…'
                          : selectedTeamSize === 1
                            ? 'Enter as Solo'
                            : 'Create Team'}
                      </Button>
                    ) : null}
                  </Stack>
                )
              ) : registration?.status === 'PENDING' ? (
                <Text variant="muted">Your registration is pending confirmation.</Text>
              ) : regOpen ? (
                <Stack gap="xs">
                  <Text variant="body">Registration is open for this event.</Text>
                  <Button size="sm" onClick={() => void handleRegister()} disabled={registerBusy}>
                    {registerBusy ? 'Registering…' : 'Register'}
                  </Button>
                </Stack>
              ) : (
                <Text variant="muted">Registration is not currently open for this event.</Text>
              )}
            </Stack>
          ) : null}

          {activeTab === 'stages' ? (
            <Stack gap="sm">
              <Heading level={3}>Stages</Heading>
              {stages.length === 0 ? (
                <Text variant="muted">No stages yet.</Text>
              ) : (
                <Stack gap="xs">
                  {stages.map((stage) => (
                    <Card key={stage.id} variant="outline">
                      <CardHeader>
                        <Inline gap="xs" justify="space-between" wrap>
                          <Link to={`/events/${slug ?? ''}/stages/${stage.id}`}>
                            <Heading level={4}>{stage.label}</Heading>
                          </Link>
                          <Inline gap="xs">
                            <Pill size="sm" variant="default">
                              {mechanismLabel(stage.mechanism)}
                            </Pill>
                            <Pill size="sm" variant="default">
                              {stage.status}
                            </Pill>
                          </Inline>
                        </Inline>
                      </CardHeader>
                      {stageDateRange(stage) ? (
                        <CardBody>
                          <Text variant="caption">{stageDateRange(stage)}</Text>
                        </CardBody>
                      ) : null}
                    </Card>
                  ))}
                </Stack>
              )}
            </Stack>
          ) : null}

          {activeTab === 'awards' && awards ? (
            <Stack gap="md">
              <Heading level={3}>Awards</Heading>
              {awards.event_awards.length === 0 && awards.stage_awards.length === 0 ? (
                <Text variant="muted">No awards for this event.</Text>
              ) : null}
              {awards.event_awards.length > 0 ? (
                <Stack gap="xs">
                  <Text variant="label">Event Awards</Text>
                  {awards.event_awards.map((award) => {
                    const grants = grantsByAward.get(award.id) ?? [];
                    return (
                      <Card key={award.id} variant="outline">
                        <CardHeader>
                          <Inline gap="xs">
                            {award.icon ? (
                              <Text>{String.fromCodePoint(Number.parseInt(award.icon, 16))}</Text>
                            ) : null}
                            <Heading level={4}>{award.name}</Heading>
                          </Inline>
                        </CardHeader>
                        {award.description ? (
                          <CardBody>
                            <Text variant="caption">{award.description}</Text>
                          </CardBody>
                        ) : null}
                        {grants.length > 0 ? (
                          <CardBody>
                            <Inline gap="xs" wrap>
                              {grants.map((g) => {
                                const u = allUsers.find((x) => x.id === g.user_id);
                                const name = u?.display_name ?? `User ${g.user_id}`;
                                const isMe = g.user_id === user?.id;
                                return (
                                  <Pill key={g.id} size="sm" variant={isMe ? 'accent' : 'default'}>
                                    {name}
                                  </Pill>
                                );
                              })}
                            </Inline>
                          </CardBody>
                        ) : null}
                      </Card>
                    );
                  })}
                </Stack>
              ) : null}
              {awards.stage_awards.map((sg) => (
                <Stack key={sg.stage_id} gap="xs">
                  <Text variant="label">{sg.stage_label}</Text>
                  {sg.awards.map((award) => {
                    const grants = grantsByAward.get(award.id) ?? [];
                    return (
                      <Card key={award.id} variant="outline">
                        <CardHeader>
                          <Inline gap="xs">
                            {award.icon ? (
                              <Text>{String.fromCodePoint(Number.parseInt(award.icon, 16))}</Text>
                            ) : null}
                            <Heading level={4}>{award.name}</Heading>
                          </Inline>
                        </CardHeader>
                        {award.description ? (
                          <CardBody>
                            <Text variant="caption">{award.description}</Text>
                          </CardBody>
                        ) : null}
                        {grants.length > 0 ? (
                          <CardBody>
                            <Inline gap="xs" wrap>
                              {grants.map((g) => {
                                const u = allUsers.find((x) => x.id === g.user_id);
                                const name = u?.display_name ?? `User ${g.user_id}`;
                                const isMe = g.user_id === user?.id;
                                return (
                                  <Pill key={g.id} size="sm" variant={isMe ? 'accent' : 'default'}>
                                    {name}
                                  </Pill>
                                );
                              })}
                            </Inline>
                          </CardBody>
                        ) : null}
                      </Card>
                    );
                  })}
                </Stack>
              ))}
            </Stack>
          ) : null}

          {activeTab === 'leaderboard' && showLeaderboard ? (
            <Stack gap="sm">
              <Heading level={3}>Leaderboard</Heading>
              {leaderboard.length === 0 ? (
                <Text variant="muted">No results yet.</Text>
              ) : (
                (() => {
                  // Collect stage columns from first entry
                  const stageColumns = leaderboard[0]?.stage_scores ?? [];
                  return (
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>#</Table.Th>
                          <Table.Th>Player</Table.Th>
                          {stageColumns.map((ss) => (
                            <Table.Th key={ss.stage_id} style={{ textAlign: 'right' }}>
                              {ss.stage_label}
                            </Table.Th>
                          ))}
                          <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {leaderboard.map((entry) => {
                          const isMe = entry.user.id === user?.id;
                          return (
                            <Table.Tr
                              key={entry.user.id}
                              style={isMe ? { fontWeight: 'bold' } : {}}
                            >
                              <Table.Td>{entry.rank}</Table.Td>
                              <Table.Td>{entry.user.display_name}</Table.Td>
                              {stageColumns.map((col) => {
                                const ss = entry.stage_scores.find(
                                  (s) => s.stage_id === col.stage_id,
                                );
                                return (
                                  <Table.Td key={col.stage_id} style={{ textAlign: 'right' }}>
                                    {ss != null ? ss.score : '—'}
                                  </Table.Td>
                                );
                              })}
                              <Table.Td style={{ textAlign: 'right' }}>
                                {entry.total_score}
                              </Table.Td>
                            </Table.Tr>
                          );
                        })}
                      </Table.Tbody>
                    </Table>
                  );
                })()
              )}
            </Stack>
          ) : null}
        </Section>
      </PageContainer>
    </Main>
  );
}
