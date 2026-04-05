import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Badge,
  Heading,
  Inline,
  Main,
  MaterialIcon,
  PageContainer,
  Section,
  Stack,
  Tabs,
  Text,
  CoreTable as Table,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { ApiError, getJson, getJsonAuth, postJsonAuth } from '../lib/api';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import type { EventSummary } from '../hooks/useEvents';
import { useUserDirectory } from '../hooks/useUserDirectory';
import { UserPill } from '../features/users/UserPill';
import { NotFoundPage } from './NotFoundPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MyTeamMember = {
  user_id: number;
  display_name: string;
  confirmed: boolean;
};

type MyTeam = {
  id: number;
  display_name: string;
  members: MyTeamMember[];
};

type PlayerStageScore = {
  stage_id: number;
  stage_label: string;
  score: number;
};

type AggregateEntry = {
  rank: number;
  team: { id: number; display_name: string; members: { user_id: number; display_name: string }[] };
  total_score: number;
  stage_scores: PlayerStageScore[];
};

type AggregateTrack = {
  team_size: number | null;
  entries: AggregateEntry[];
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

function statusBannerTone(event: EventSummary): 'info' | 'success' | undefined {
  if (event.status === 'REGISTRATION_OPEN' || event.status === 'IN_PROGRESS') return 'info';
  if (event.status === 'LIVE') return 'success';
  return undefined;
}

function stageDateRange(stage: StageSummary): string | null {
  if (stage.starts_at && stage.ends_at) {
    return `${formatDate(stage.starts_at)} — ${formatDate(stage.ends_at)}`;
  }
  if (stage.starts_at) return `Starts ${formatDate(stage.starts_at)}`;
  if (stage.ends_at) return `Ends ${formatDate(stage.ends_at)}`;
  return null;
}

function isStageActive(stage: StageSummary): boolean {
  const now = Date.now();
  const start = stage.starts_at ? new Date(stage.starts_at).getTime() : null;
  const end = stage.ends_at ? new Date(stage.ends_at).getTime() : null;
  if (start !== null && start > now) return false;
  if (end !== null && end < now) return false;
  return true;
}

function isStageBeforeWindow(stage: StageSummary): boolean {
  if (!stage.starts_at) return false;
  return new Date(stage.starts_at).getTime() > Date.now();
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function EventDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');

  // Public data
  const [event, setEvent] = useState<EventSummary | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [lbTracks, setLbTracks] = useState<AggregateTrack[]>([]);
  const [activeLbSize, setActiveLbSize] = useState<number | null | undefined>(undefined);
  const [awards, setAwards] = useState<GroupedAwardsResponse | null>(null);
  const [grantsByAward, setGrantsByAward] = useState<Map<number, AwardGrant[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // My teams (auth)
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);

  // Leaderboard sort — default: total_score descending
  type LbSortCol = 'total' | 'team' | number; // number = stage_id
  const [lbSort, setLbSort] = useState<{ col: LbSortCol; dir: 'asc' | 'desc' }>({
    col: 'total',
    dir: 'desc',
  });

  // Leaderboard spoiler gate
  const [lbGateMode, setLbGateMode] = useState<
    'loading' | 'allow' | 'login' | 'blocked' | 'prompt' | 'error'
  >('loading');
  const [lbGateError, setLbGateError] = useState<string | null>(null);
  const [lbForfeitLoading, setLbForfeitLoading] = useState(false);

  // Stage seed accordion
  const [expandedStages, setExpandedStages] = useState<Set<number>>(new Set());
  const [stageSeeds, setStageSeeds] = useState<
    Map<
      number,
      { id: number; game_index: number; nickname: string | null; effective_seed: string | null }[]
    >
  >(new Map());

  const { users: allUsers } = useUserDirectory();

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
          getJson<{ tracks: AggregateTrack[] }>(
            `/events/${encodeURIComponent(slug!)}/leaderboard`,
          ).catch(() => ({ tracks: [] as AggregateTrack[] })),
          getJson<GroupedAwardsResponse>(`/events/${encodeURIComponent(slug!)}/awards`).catch(
            () => null,
          ),
        ]);
        if (!cancelled) {
          setEvent(eventData);
          setStages(stagesData);
          setExpandedStages(new Set(stagesData.filter(isStageActive).map((s) => s.id)));
          setLbTracks(lbData.tracks);
          setActiveLbSize(lbData.tracks[0]?.team_size ?? undefined);
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

  // Load user's teams
  useEffect(() => {
    if (!slug || !token) {
      setMyTeams([]);
      return;
    }
    let cancelled = false;
    getJsonAuth<MyTeam[]>(`/events/${encodeURIComponent(slug)}/teams?mine=true`, token)
      .then((teams) => {
        if (!cancelled) setMyTeams(teams);
      })
      .catch(() => {
        if (!cancelled) setMyTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, token]);

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

  // Reset leaderboard sort to default when switching team-size tracks
  useEffect(() => {
    setLbSort({ col: 'total', dir: 'desc' });
  }, [activeLbSize]);

  // Leaderboard spoiler gate
  useEffect(() => {
    if (!slug || event === null) return;

    const now = Date.now();
    const endedAt = event.ends_at ? new Date(event.ends_at).getTime() : null;
    const cutoff = event.registration_cutoff
      ? new Date(event.registration_cutoff).getTime()
      : endedAt;
    const registrationClosed = cutoff != null && !event.allow_late_registration && cutoff < now;
    if ((endedAt && endedAt < now) || registrationClosed) {
      setLbGateMode('allow');
      return;
    }

    if (!user || !token) {
      setLbGateMode('login');
      return;
    }

    let cancelled = false;
    (async () => {
      setLbGateMode('loading');
      setLbGateError(null);
      try {
        const statuses = await getJsonAuth<{ status: string; team_size: number }[]>(
          `/events/${encodeURIComponent(slug)}/eligibility/me`,
          token,
        );
        if (cancelled) return;
        const entries = Array.isArray(statuses) ? statuses : [];
        const hasEnrolled = entries.some((e) => e.status === 'ENROLLED');
        if (hasEnrolled) {
          setLbGateMode('blocked');
          return;
        }
        const allowedStatuses = ['INELIGIBLE', 'COMPLETED'];
        const allAllowed =
          entries.length > 0 && entries.every((e) => allowedStatuses.includes(e.status));
        setLbGateMode(allAllowed ? 'allow' : 'prompt');
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setLbGateMode('login');
          return;
        }
        console.error('Failed to check leaderboard eligibility', err);
        setLbGateError('Failed to check eligibility. Please try again.');
        setLbGateMode('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, event, user, token]);

  // Load seeds for any expanded stage that hasn't been fetched yet
  useEffect(() => {
    if (!slug) return;
    for (const stageId of expandedStages) {
      if (!stageSeeds.has(stageId)) {
        getJson<
          {
            id: number;
            game_index: number;
            nickname: string | null;
            effective_seed: string | null;
          }[]
        >(`/events/${encodeURIComponent(slug)}/stages/${stageId}/games`)
          .then((seeds) => setStageSeeds((prev) => new Map(prev).set(stageId, seeds)))
          .catch(() => setStageSeeds((prev) => new Map(prev).set(stageId, [])));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedStages, slug]);

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
  function toggleStage(stageId: number) {
    setExpandedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }

  const showLeaderboard = lbTracks.length > 0 && lbTracks.some((t) => t.entries.length > 0);
  const activeLbTrack = lbTracks.find((t) => t.team_size === activeLbSize) ?? lbTracks[0];
  const leaderboard = activeLbTrack?.entries ?? [];

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      active: activeTab === 'overview',
      onSelect: () => setActiveTab('overview'),
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
    ...(user && myTeams.length > 0
      ? [
          {
            key: 'my-teams',
            label: myTeams.length === 1 ? 'My Team' : 'My Teams',
            active: activeTab === 'my-teams',
            onSelect: () => {
              if (myTeams.length === 1) {
                void navigate(`/events/${slug}/event-teams/${myTeams[0].id}`);
              } else {
                setActiveTab('my-teams');
              }
            },
          },
        ]
      : []),
  ];

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          {/* Header */}
          <Stack gap="md">
            <Stack gap="xs">
              <Heading level={1}>{event.name}</Heading>
              <Inline gap="xs" wrap>
                {bannerText ? (
                  <Badge size="sm" tone={statusBannerTone(event)}>
                    {bannerText}
                  </Badge>
                ) : null}
                {event.starts_at || event.ends_at ? (
                  <Badge size="sm" tone="info">
                    {event.starts_at && event.ends_at
                      ? `${formatDate(event.starts_at)} – ${formatDate(event.ends_at)}`
                      : event.starts_at
                        ? `Starts ${formatDate(event.starts_at)}`
                        : `Ends ${formatDate(event.ends_at)}`}
                  </Badge>
                ) : null}
              </Inline>
            </Stack>

            {/* Tabs */}
            <Tabs items={tabItems} />
          </Stack>

          {/* Tab content */}
          <Stack gap="md" style={{ marginTop: 'var(--ds-space-lg)' }}>
            {activeTab === 'overview' ? (
              <Stack gap="lg">
                <MarkdownRenderer markdown={event.long_description} />
                {stages.length > 0 ? (
                  <Stack gap="sm">
                    <Heading level={2}>Stages</Heading>
                    {stages.map((stage) => {
                      const isExpanded = expandedStages.has(stage.id);
                      const seeds = stageSeeds.get(stage.id);
                      const dateRange = stageDateRange(stage);
                      const locked = isStageBeforeWindow(stage);
                      const active = isStageActive(stage);
                      return (
                        <Card key={stage.id} variant="outline">
                          <CardHeader
                            style={{ cursor: locked ? 'default' : 'pointer' }}
                            onClick={locked ? undefined : () => toggleStage(stage.id)}
                          >
                            <Inline gap="xs" justify="space-between" wrap>
                              <Inline gap="xs" align="center">
                                {locked ? <MaterialIcon name="lock" size={14} /> : null}
                                <Text style={{ fontWeight: 500 }}>{stage.label}</Text>
                              </Inline>
                              <Inline gap="xs" align="center">
                                {dateRange ? (
                                  <Badge size="sm" tone={active ? 'info' : undefined}>
                                    {dateRange}
                                  </Badge>
                                ) : null}
                                {!locked ? (
                                  <MaterialIcon
                                    name={isExpanded ? 'expand_less' : 'expand_more'}
                                    size={20}
                                  />
                                ) : null}
                              </Inline>
                            </Inline>
                          </CardHeader>
                          {isExpanded ? (
                            <CardBody>
                              {seeds === undefined ? (
                                <Text variant="muted">Loading seeds…</Text>
                              ) : seeds.length === 0 ? (
                                <Text variant="muted">No seeds available.</Text>
                              ) : (
                                <Stack gap="xs">
                                  {seeds.map((s) => (
                                    <Text key={s.id} variant="caption">
                                      {s.game_index + 1}. {s.nickname ?? s.effective_seed ?? '—'}
                                    </Text>
                                  ))}
                                </Stack>
                              )}
                            </CardBody>
                          ) : null}
                        </Card>
                      );
                    })}
                  </Stack>
                ) : null}
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
                                  return (
                                    <UserPill
                                      key={g.id}
                                      name={name}
                                      color={u?.color_hex}
                                      textColor={u?.text_color}
                                      size="sm"
                                    />
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
                                  return (
                                    <UserPill
                                      key={g.id}
                                      name={name}
                                      color={u?.color_hex}
                                      textColor={u?.text_color}
                                      size="sm"
                                    />
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
                {lbGateMode !== 'allow' ? (
                  <Stack gap="sm">
                    {lbGateMode === 'loading' && <Text variant="muted">Checking eligibility…</Text>}
                    {lbGateMode === 'login' && (
                      <Stack gap="sm">
                        <Text>
                          The leaderboard contains spoilers. Log in so we can check your eligibility
                          before you decide whether to peek.
                        </Text>
                        <Inline>
                          <Button as={Link} to="/login" variant="primary" size="sm">
                            Log in
                          </Button>
                        </Inline>
                      </Stack>
                    )}
                    {lbGateMode === 'blocked' && (
                      <Text>
                        You&apos;re enrolled for this event, so the leaderboard is hidden to protect
                        fairness. Finish playing before peeking.
                      </Text>
                    )}
                    {lbGateMode === 'prompt' && (
                      <Stack gap="sm">
                        <Text>
                          The leaderboard contains spoilers. Viewing it will forfeit your
                          eligibility to participate. If you still plan to play, hold off &mdash; no
                          hard feelings either way.
                        </Text>
                        <Inline gap="sm">
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={lbForfeitLoading}
                            onClick={async () => {
                              if (!token) return;
                              setLbForfeitLoading(true);
                              setLbGateError(null);
                              try {
                                await postJsonAuth(
                                  `/events/${encodeURIComponent(slug!)}/eligibility/spoilers`,
                                  token,
                                  { all_team_sizes: true, reason: 'leaderboard_spoiler' },
                                );
                                setLbGateMode('allow');
                              } catch (err) {
                                console.error('Failed to update eligibility', err);
                                setLbGateError('Failed to update eligibility. Please try again.');
                              } finally {
                                setLbForfeitLoading(false);
                              }
                            }}
                          >
                            {lbForfeitLoading ? 'Continuing…' : 'View leaderboard'}
                          </Button>
                        </Inline>
                        {lbGateError && <Alert variant="error" message={lbGateError} />}
                      </Stack>
                    )}
                    {lbGateMode === 'error' && (
                      <Alert
                        variant="error"
                        message={lbGateError ?? 'Unable to check eligibility.'}
                      />
                    )}
                  </Stack>
                ) : (
                  <>
                    {lbTracks.length > 1 ? (
                      <Tabs
                        items={lbTracks.map((t) => ({
                          key: String(t.team_size),
                          label: t.team_size === null ? 'Combined' : `${t.team_size}p`,
                          active: t.team_size === activeLbSize,
                          onSelect: () => setActiveLbSize(t.team_size),
                        }))}
                      />
                    ) : null}
                    {leaderboard.length === 0 ? (
                      <Text variant="muted">No results yet.</Text>
                    ) : (
                      (() => {
                        const stageColumns = activeLbTrack?.entries[0]?.stage_scores ?? [];

                        function handleSort(col: LbSortCol) {
                          setLbSort((prev) => {
                            if (prev.col === col) {
                              return { col, dir: prev.dir === 'desc' ? 'asc' : 'desc' };
                            }
                            return { col, dir: col === 'team' ? 'asc' : 'desc' };
                          });
                        }

                        function sortIndicator(col: LbSortCol) {
                          if (lbSort.col !== col) return null;
                          return lbSort.dir === 'desc' ? ' ↓' : ' ↑';
                        }

                        const sorted = [...leaderboard].sort((a, b) => {
                          let cmp = 0;
                          if (lbSort.col === 'total') {
                            cmp = a.total_score - b.total_score;
                          } else if (lbSort.col === 'team') {
                            cmp = a.team.display_name.localeCompare(b.team.display_name);
                          } else {
                            const aScore =
                              a.stage_scores.find((s) => s.stage_id === lbSort.col)?.score ??
                              -Infinity;
                            const bScore =
                              b.stage_scores.find((s) => s.stage_id === lbSort.col)?.score ??
                              -Infinity;
                            cmp = aScore - bScore;
                          }
                          return lbSort.dir === 'desc' ? -cmp : cmp;
                        });

                        const thStyle = (col: LbSortCol, align: 'left' | 'right' = 'left') => ({
                          textAlign: align,
                          cursor: 'pointer',
                          userSelect: 'none' as const,
                          whiteSpace: 'nowrap' as const,
                          opacity: lbSort.col === col ? 1 : 0.75,
                        });

                        return (
                          <div style={{ overflowX: 'auto' }}>
                            <Table style={{ width: 'auto' }}>
                              <Table.Thead>
                                <Table.Tr>
                                  <Table.Th
                                    style={thStyle('total')}
                                    onClick={() => handleSort('total')}
                                  >
                                    #{sortIndicator('total')}
                                  </Table.Th>
                                  <Table.Th
                                    style={thStyle('team')}
                                    onClick={() => handleSort('team')}
                                  >
                                    Team{sortIndicator('team')}
                                  </Table.Th>
                                  {stageColumns.map((s) => (
                                    <Table.Th
                                      key={s.stage_id}
                                      style={thStyle(s.stage_id, 'right')}
                                      onClick={() => handleSort(s.stage_id)}
                                    >
                                      {s.stage_label}
                                      {sortIndicator(s.stage_id)}
                                    </Table.Th>
                                  ))}
                                  <Table.Th
                                    style={thStyle('total', 'right')}
                                    onClick={() => handleSort('total')}
                                  >
                                    Total{sortIndicator('total')}
                                  </Table.Th>
                                </Table.Tr>
                              </Table.Thead>
                              <Table.Tbody>
                                {sorted.map((entry) => {
                                  const isMe = entry.team.members.some(
                                    (m) => m.user_id === user?.id,
                                  );
                                  const scoreByStage = new Map(
                                    entry.stage_scores.map((s) => [s.stage_id, s.score]),
                                  );
                                  return (
                                    <Table.Tr
                                      key={entry.team.id}
                                      style={isMe ? { fontWeight: 'bold' } : {}}
                                    >
                                      <Table.Td>{entry.rank}</Table.Td>
                                      <Table.Td>
                                        <Link to={`/events/${slug}/event-teams/${entry.team.id}`}>
                                          {entry.team.display_name}
                                        </Link>
                                      </Table.Td>
                                      {stageColumns.map((s) => (
                                        <Table.Td key={s.stage_id} style={{ textAlign: 'right' }}>
                                          {scoreByStage.get(s.stage_id) ?? '—'}
                                        </Table.Td>
                                      ))}
                                      <Table.Td style={{ textAlign: 'right' }}>
                                        {entry.total_score}
                                      </Table.Td>
                                    </Table.Tr>
                                  );
                                })}
                              </Table.Tbody>
                            </Table>
                          </div>
                        );
                      })()
                    )}
                  </>
                )}
              </Stack>
            ) : null}

            {activeTab === 'my-teams' && myTeams.length > 1 ? (
              <Stack gap="sm">
                <Heading level={2}>My Teams</Heading>
                {myTeams.map((team) => (
                  <Card key={team.id} variant="outline">
                    <CardHeader>
                      <Inline gap="xs" justify="space-between" wrap>
                        <Link to={`/events/${slug}/event-teams/${team.id}`}>
                          <Text style={{ fontWeight: 500 }}>{team.display_name}</Text>
                        </Link>
                        <Inline gap="xs" wrap>
                          {team.members.map((m) => (
                            <UserPill key={m.user_id} name={m.display_name} size="sm" />
                          ))}
                        </Inline>
                      </Inline>
                    </CardHeader>
                  </Card>
                ))}
              </Stack>
            ) : null}
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
