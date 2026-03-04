import { Link, useParams } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';
import { useTeamDetail, type TeamGame } from '../hooks/useTeamDetail';
import { useTeamTemplates } from '../hooks/useTeamTemplates';
import { UserPill } from '../features/users/UserPill';
import { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { postJsonAuth } from '../lib/api';
import { SpoilerGatePage } from './SpoilerGatePage';
import { useEventDetail } from '../hooks/useEventDetail';
import { PageStateNotice } from '../features/shared/PageStateNotice';
import {
  Button,
  Main,
  CoreBox as Box,
  CoreGroup as Group,
  CoreTable as Table,
  CoreText as Text,
  CoreTitle as Title,
} from '../design-system';
import './TeamPage.css';
import {
  PlayedRow,
  UnplayedRow,
  groupTemplatesByStage,
  type TeamGameDraft,
} from '../features/teams/team-page/gameRows';

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function TeamPage() {
  const { slug, teamId } = useParams<{ slug: string; teamId: string }>();

  const parsedTeamId = (() => {
    const n = Number(teamId);
    return Number.isInteger(n) ? n : null;
  })();

  const { data, loading, error, notFound, refetch, gate } = useTeamDetail(parsedTeamId);
  const { event: eventMeta } = useEventDetail(slug);
  const [templatesEnabled, setTemplatesEnabled] = useState(true);
  const {
    templates,
    loading: templatesLoading,
    error: templatesError,
  } = useTeamTemplates(parsedTeamId, {
    enabled: templatesEnabled,
  });
  const { user, token } = useAuth();
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, TeamGameDraft>>({});
  const [forfeitLoading, setForfeitLoading] = useState(false);
  const [nowTs, setNowTs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (gate) {
      setTemplatesEnabled(false);
    } else {
      setTemplatesEnabled(true);
    }
  }, [gate]);

  const members = useMemo(() => data?.members ?? [], [data]);
  const isMember = useMemo(
    () => (user ? members.some((m) => m.user_id === user.id) : false),
    [user, members],
  );
  const hasPlayed = useMemo(() => {
    if (!user || !data?.games) return false;
    return data.games.some((g) =>
      (g.players ?? []).some((p) => p.display_name === user.display_name),
    );
  }, [data?.games, user]);
  const canDeleteTeam =
    user &&
    data?.team.owner_user_id != null &&
    user.id === data.team.owner_user_id &&
    (data.games?.length ?? 0) === 0;

  const memberColorMap = useMemo(() => {
    const map: Record<string, { color: string; textColor: string }> = {};
    members.forEach((m) => {
      map[m.display_name] = { color: m.color_hex, textColor: m.text_color };
    });
    return map;
  }, [members]);

  const games = useMemo(() => (Array.isArray(data?.games) ? data.games : []), [data]);
  const stats = useMemo(() => {
    const totalTemplates = templates.length;
    const completed = templates.filter((t) => t.result).length;
    const totalScore = templates.reduce((sum, t) => sum + (t.result?.score ?? 0), 0);
    const maxScoreTotal = templates.reduce((sum, t) => sum + (t.max_score ?? 25), 0);
    const winCount = templates.filter(
      (t) => t.result && t.max_score != null && t.result.score === t.max_score,
    ).length;
    const avgScore = completed > 0 ? totalScore / completed : null;
    const avgBdrCount = templates.filter((t) => t.result && t.result.bottom_deck_risk != null);
    const avgBdr =
      avgBdrCount.length > 0
        ? avgBdrCount.reduce((sum, t) => sum + (t.result!.bottom_deck_risk ?? 0), 0) /
          avgBdrCount.length
        : null;
    return {
      totalTemplates,
      completed,
      percentMax: maxScoreTotal > 0 ? totalScore / maxScoreTotal : null,
      winRate: completed > 0 ? winCount / completed : null,
      avgScore,
      avgBdr,
    };
  }, [templates]);

  const templateStages = groupTemplatesByStage(templates ?? []);
  const gameByTemplateId = useMemo(() => {
    const map = new Map<number, TeamGame>();
    games.forEach((g) => map.set(g.event_game_template_id, g));
    return map;
  }, [games]);
  const collapsedMap = useMemo(() => {
    const defaults: Record<string, boolean> = {};
    templateStages.forEach((stage) => {
      if (stage.stage_status === 'in_progress') defaults[stage.stage_label] = false;
      if (stage.stage_status === 'complete') defaults[stage.stage_label] = true;
    });
    return defaults;
  }, [templateStages]);
  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});
  const handleForfeit = async () => {
    if (!token || !parsedTeamId) return;
    setForfeitLoading(true);
    try {
      await postJsonAuth(
        `/events/${gate?.event_slug ?? data?.team.event_slug}/eligibility/spoilers`,
        token,
        {
          team_size: gate?.team_size ?? data?.team.team_size,
          source_event_team_id: parsedTeamId,
          reason: 'team_page_spoiler',
        },
      );
      setTemplatesEnabled(true);
      await refetch();
    } catch (err) {
      console.error('Failed to forfeit eligibility', err);
    } finally {
      setForfeitLoading(false);
    }
  };

  const playStartsAt = eventMeta?.starts_at ? new Date(eventMeta.starts_at).getTime() : null;
  const playEndsAt = eventMeta?.ends_at ? new Date(eventMeta.ends_at).getTime() : null;
  const playWindow = useMemo(() => {
    if (!playStartsAt && !playEndsAt) return null;
    if (playStartsAt && nowTs < playStartsAt) {
      return {
        state: 'not_started' as const,
        label: `Play starts in ${formatCountdown(playStartsAt - nowTs)}`,
      };
    }
    if (playEndsAt && nowTs < playEndsAt) {
      return {
        state: 'open' as const,
        label: `Play ends in ${formatCountdown(playEndsAt - nowTs)}`,
      };
    }
    if (playEndsAt && nowTs >= playEndsAt) {
      return { state: 'closed' as const, label: 'Play closed' };
    }
    return { state: 'open' as const, label: 'Play open' };
  }, [playStartsAt, playEndsAt, nowTs]);

  if (!parsedTeamId || notFound) {
    return <NotFoundPage />;
  }

  if (loading) {
    return <PageStateNotice message="Loading team..." />;
  }

  if (error) {
    return <PageStateNotice title="Team" message={error} variant="error" />;
  }

  if (gate && !isMember) {
    return (
      <SpoilerGatePage
        mode={gate.mode === 'prompt' ? 'prompt' : gate.mode === 'blocked' ? 'blocked' : 'login'}
        eventSlug={gate.event_slug || slug}
        onForfeit={gate.mode === 'prompt' ? handleForfeit : undefined}
        loading={forfeitLoading}
        errorMessage={gate.message}
      />
    );
  }

  if (!data) {
    return <NotFoundPage />;
  }

  // If slug is provided and doesn't match, treat as not found to prevent cross-event access
  if (slug && slug !== data.team.event_slug) {
    return <NotFoundPage />;
  }

  return (
    <Main className="page">
      <Box component="header" className="stack-sm">
        <Text className="team-page__meta">
          <Link to={`/events/${data.team.event_slug}`} className="team-page__event-link">
            {data.team.event_name}
          </Link>{' '}
          · Team
        </Text>
        <Box className="team-page__header-row">
          <Title order={1} className="team-page__title">
            {data.team.name}
          </Title>
          <Text component="span" className="pill pill--accent">
            {data.team.team_size}-Player Team
          </Text>
        </Box>
      </Box>
      {leaveError && <Text className="team-page__error">{leaveError}</Text>}

      <Box
        component="section"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: 'var(--space-md)',
          alignItems: 'stretch',
        }}
      >
        <Box className="card stack-sm" style={{ height: '100%' }}>
          <Title order={2} className="team-page__section-title">
            Roster
          </Title>
          {data.members.length === 0 ? (
            <Text className="team-page__muted">No members listed yet.</Text>
          ) : (
            <Group gap="xs" wrap="wrap">
              {data.members.map((member) => (
                <UserPill
                  key={member.id}
                  name={member.display_name}
                  color={member.color_hex}
                  textColor={member.text_color}
                />
              ))}
            </Group>
          )}
        </Box>
        <Box className="card stack-sm" style={{ height: '100%' }}>
          <Title order={2} className="team-page__section-title">
            Performance
          </Title>
          <Box
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
              gap: 'var(--space-sm)',
            }}
          >
            <Box className="card stack-sm kpi-card">
              <Text component="span" className="kpi-label">
                Games Completed
              </Text>
              <Text component="span" className="kpi-value">
                {stats.completed} / {stats.totalTemplates}
              </Text>
            </Box>
            <Box className="card stack-sm kpi-card">
              <Text component="span" className="kpi-label">
                Win Rate
              </Text>
              <Text component="span" className="kpi-value">
                {stats.winRate != null ? `${Math.round(stats.winRate * 100)}%` : '—'}
              </Text>
            </Box>
            <Box className="card stack-sm kpi-card">
              <Text component="span" className="kpi-label">
                Avg BDR
              </Text>
              <Text component="span" className="kpi-value">
                {stats.avgBdr != null ? stats.avgBdr.toFixed(2) : '—'}
              </Text>
            </Box>
            <Box className="card stack-sm kpi-card">
              <Text component="span" className="kpi-label">
                Avg Score
              </Text>
              <Text component="span" className="kpi-value">
                {stats.avgScore != null ? stats.avgScore.toFixed(2) : '—'}
              </Text>
            </Box>
            <Box
              className="card"
              style={{ gridColumn: 3, gridRow: '1 / span 2', minHeight: '180px' }}
            />
          </Box>
        </Box>
      </Box>

      <Box component="section" className="stack-sm">
        <Box className="team-page__games-header">
          <Box className="team-page__games-header-left">
            <Title order={2} className="team-page__section-title">
              Games
            </Title>
            {playWindow && (
              <Text
                component="span"
                className={`pill ${playWindow.state === 'open' ? 'pill--accent' : ''}`}
              >
                {playWindow.label}
              </Text>
            )}
          </Box>
          {templatesLoading && <Text className="team-page__meta">Loading games…</Text>}
        </Box>
        {templatesError && <Text className="team-page__error">{templatesError}</Text>}
        {!templatesLoading && templates.length === 0 && (
          <Text className="team-page__muted">No games found.</Text>
        )}
        {playWindow?.state === 'not_started' && (
          <Box className="card" style={{ padding: 'var(--space-md)' }}>
            <Text style={{ margin: 0 }}>
              Play hasn&apos;t started yet. Come back when the window opens to see seeds and submit
              replays.
            </Text>
          </Box>
        )}
        {!templatesLoading && templates.length > 0 && playWindow?.state !== 'not_started' && (
          <Box className="stack">
            {templateStages.map((stage) => (
              <Box key={stage.stage_label} className="card" style={{ padding: 0 }}>
                {(() => {
                  const played = stage.templates.filter((t) => Boolean(t.result)).length;
                  const perfect = stage.templates.filter(
                    (t) => t.result && t.max_score != null && t.result.score === t.max_score,
                  ).length;
                  const baseCollapsed = collapsedMap[stage.stage_label];
                  const isCollapsed =
                    collapsedOverrides[stage.stage_label] ?? baseCollapsed ?? false;
                  return (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setCollapsedOverrides((prev) => ({
                          ...prev,
                          [stage.stage_label]: !isCollapsed,
                        }))
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        border: 'none',
                        width: '100%',
                        textAlign: 'left',
                        background: 'var(--color-surface-muted)',
                        padding: '4px var(--space-sm)',
                        gap: 'var(--space-sm)',
                        borderBottom: '1px solid var(--color-border)',
                        cursor: 'pointer',
                      }}
                    >
                      <Box style={{ minWidth: 0, overflow: 'hidden' }}>
                        <Title
                          order={3}
                          className="team-page__stage-title"
                          style={{
                            margin: 0,
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                          }}
                        >
                          {stage.stage_label}
                        </Title>
                      </Box>
                      <Box
                        style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                        className="team-page__stage-stats"
                      >
                        {perfect} / {played}
                      </Box>
                    </Button>
                  );
                })()}
                {!(
                  collapsedOverrides[stage.stage_label] ??
                  collapsedMap[stage.stage_label] ??
                  false
                ) && (
                  <Table>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Index</Table.Th>
                        <Table.Th>Variant</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>Score</Table.Th>
                        <Table.Th>Outcome</Table.Th>
                        <Table.Th style={{ textAlign: 'right' }}>BDR</Table.Th>
                        <Table.Th>Players</Table.Th>
                        <Table.Th>Date</Table.Th>
                        <Table.Th>Game ID</Table.Th>
                        <Table.Th>Notes</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {stage.templates.map((tpl) =>
                        tpl.result ? (
                          <PlayedRow
                            key={tpl.template_id}
                            template={tpl}
                            fallbackGame={gameByTemplateId.get(tpl.template_id)}
                          />
                        ) : (
                          <UnplayedRow
                            key={tpl.template_id}
                            template={tpl}
                            draft={
                              drafts[tpl.template_id] ?? {
                                replay: '',
                                bdr: '',
                                notes: '',
                                replayError: null,
                                replayGameId: null,
                                validateStatus: 'idle',
                                validateMessage: null,
                                derivedScore: null,
                                derivedEndCondition: null,
                                derivedPlayers: [],
                                derivedPlayedAt: null,
                                derivedEndConditionCode: null,
                                validationRaw: null,
                              }
                            }
                            teamSize={data.team.team_size}
                            tablePassword={data.team.table_password ?? undefined}
                            showCreateLink={isMember}
                            slug={slug ?? ''}
                            teamId={data.team.id}
                            token={token ?? undefined}
                            memberColors={memberColorMap}
                            editable={isMember}
                            onDraftChange={(next) =>
                              setDrafts((prev) => ({ ...prev, [tpl.template_id]: next }))
                            }
                          />
                        ),
                      )}
                    </Table.Tbody>
                  </Table>
                )}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {isMember && !hasPlayed && (
        <Box
          style={{ marginTop: 'var(--space-md)', display: 'flex', justifyContent: 'flex-start' }}
        >
          <Button
            variant="primary"
            style={{ backgroundColor: '#dc2626', color: '#fff' }}
            onClick={() => {
              if (!token || !user) return;
              const promptText = canDeleteTeam
                ? 'Delete this team? This cannot be undone.'
                : 'Leave this team? This cannot be undone.';
              const confirmed = window.confirm(promptText);
              if (!confirmed) return;
              (async () => {
                setLeaving(true);
                setLeaveError(null);
                try {
                  const endpoint = canDeleteTeam
                    ? `/api/event-teams/${data.team.id}`
                    : `/api/event-teams/${data.team.id}/members/${user.id}`;
                  const res = await fetch(endpoint, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    setLeaveError(
                      body.error ||
                        (canDeleteTeam ? 'Failed to delete team' : 'Failed to leave team'),
                    );
                  } else {
                    await refetch();
                    window.location.href = `/events/${data.team.event_slug}`;
                  }
                } catch (err) {
                  console.error('Failed to update team membership', err);
                  setLeaveError(canDeleteTeam ? 'Failed to delete team' : 'Failed to leave team');
                } finally {
                  setLeaving(false);
                }
              })();
            }}
            disabled={leaving}
          >
            {leaving
              ? canDeleteTeam
                ? 'Deleting…'
                : 'Leaving…'
              : canDeleteTeam
                ? 'Delete team'
                : 'Leave team'}
          </Button>
        </Box>
      )}
    </Main>
  );
}
