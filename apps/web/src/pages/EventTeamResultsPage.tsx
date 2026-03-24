import { useEffect, useState, type FormEvent } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { IconExternalLink } from '@tabler/icons-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Input,
  Inline,
  Main,
  PageContainer,
  Section,
  Select,
  Stack,
  Tabs,
  Text,
  CoreTable as Table,
} from '../design-system';
import { UserPill } from '../features/users/UserPill';
import { getJson, getJsonAuth, postJsonAuth, ApiError } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { NotFoundPage } from './NotFoundPage';
import { PageStateNotice } from '../features/shared/PageStateNotice';
import { SpoilerGatePage } from './SpoilerGatePage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GameResult = {
  stage_game_id: number;
  game_index: number;
  effective_seed: string | null;
  effective_variant_name: string | null;
  effective_max_score: number | null;
  score: number | null;
  bdr: number | null;
  strikes: number | null;
  turns_played: number | null;
  hanabi_live_game_id: number | null;
  played_at: string | null;
  zero_reason: string | null;
};

type StageResults = {
  id: number;
  label: string;
  stage_index: number;
  games: GameResult[];
};

type TeamMember = {
  user_id: number;
  display_name: string;
  color_hex: string | null;
  text_color: string | null;
};

type TeamResultsResponse = {
  team: {
    id: number;
    display_name: string;
    team_size: number;
    members: TeamMember[];
  };
  stages: StageResults[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildCreateTableUrl(seed: string, variantName: string, teamSize: number): string {
  const params = new URLSearchParams({
    name: `!seed ${seed}`,
    variantName,
    deckPlays: 'false',
    emptyClues: 'false',
    detrimentalCharacters: 'false',
    oneLessCard: 'false',
    oneExtraCard: 'false',
    allOrNothing: 'false',
    maxPlayers: String(teamSize),
  });
  return `https://hanab.live/create-table?${params.toString().replace(/\+/g, '%20')}`;
}

function parseGameId(input: string): number | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/hanab\.live\/replay\/(\d+)/);
  if (urlMatch) return Number(urlMatch[1]);
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return null;
}

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

type SubmitStatus =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success' }
  | { type: 'error'; message: string };

type SubmissionFormProps = {
  slug: string;
  stageId: number;
  teamId: number;
  unplayedGames: { stage_game_id: number; game_index: number }[];
  token: string;
  onSuccess: () => void;
};

function SubmissionForm({
  slug,
  stageId,
  teamId,
  unplayedGames,
  token,
  onSuccess,
}: SubmissionFormProps) {
  const [input, setInput] = useState('');
  const [selectedGameId, setSelectedGameId] = useState<number | null>(
    unplayedGames[0]?.stage_game_id ?? null,
  );
  const [status, setStatus] = useState<SubmitStatus>({ type: 'idle' });

  useEffect(() => {
    setSelectedGameId(unplayedGames[0]?.stage_game_id ?? null);
  }, [stageId, unplayedGames]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const hanabiLiveGameId = parseGameId(input);
    if (!hanabiLiveGameId) {
      setStatus({ type: 'error', message: 'Enter a valid hanab.live game ID or URL.' });
      return;
    }
    if (!selectedGameId) {
      setStatus({ type: 'error', message: 'No game slot selected.' });
      return;
    }

    setStatus({ type: 'loading' });
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${selectedGameId}/results`,
        token,
        { team_id: teamId, score: 0, hanabi_live_game_id: hanabiLiveGameId },
      );
      setStatus({ type: 'success' });
      setInput('');
      onSuccess();
    } catch (err) {
      const msg =
        err instanceof ApiError && (err.body as { error?: string })?.error
          ? (err.body as { error: string }).error
          : 'Something went wrong. Please try again.';
      setStatus({ type: 'error', message: msg });
    }
  }

  const gameOptions = unplayedGames.map((g) => ({
    value: String(g.stage_game_id),
    label: `Game ${g.game_index + 1}`,
  }));

  const isAllPlayed = unplayedGames.length === 0;

  return (
    <Card>
      <CardHeader>
        <Text variant="label">Submit Result</Text>
      </CardHeader>
      <CardBody>
        <form onSubmit={handleSubmit}>
          <Stack gap="sm">
            {isAllPlayed ? (
              <Text variant="muted">All results recorded for this stage.</Text>
            ) : (
              <>
                {unplayedGames.length > 1 && (
                  <Stack gap="xs">
                    <Text variant="label">Game</Text>
                    <Select
                      value={selectedGameId !== null ? String(selectedGameId) : ''}
                      onChange={(v) => setSelectedGameId(v ? Number(v) : null)}
                      options={gameOptions}
                    />
                  </Stack>
                )}
                <Input
                  label="hanab.live replay"
                  placeholder="URL or game ID"
                  value={input}
                  onChange={(e) => {
                    setInput((e.target as HTMLInputElement).value);
                    setStatus({ type: 'idle' });
                  }}
                  disabled={status.type === 'loading'}
                />
                <Inline gap="sm">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={status.type === 'loading' || !input.trim()}
                  >
                    {status.type === 'loading' ? 'Submitting…' : 'Submit'}
                  </Button>
                </Inline>
              </>
            )}
            {status.type === 'success' && (
              <Alert variant="success" message="Result submitted successfully." />
            )}
            {status.type === 'error' && <Alert variant="error" message={status.message} />}
          </Stack>
        </form>
      </CardBody>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type GateMode = 'login' | 'prompt' | null;

export function EventTeamResultsPage() {
  const { slug, teamId } = useParams<{ slug: string; teamId: string }>();
  const { token, user } = useAuth();
  const location = useLocation();

  const [data, setData] = useState<TeamResultsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [gateMode, setGateMode] = useState<GateMode>(null);
  const [forfeitLoading, setForfeitLoading] = useState(false);
  const [activeStageId, setActiveStageId] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !teamId) return;
    let cancelled = false;

    setLoading(true);
    setNotFound(false);
    setGateMode(null);

    const path = `/events/${encodeURIComponent(slug)}/teams/${teamId}`;
    const request = token
      ? getJsonAuth<TeamResultsResponse>(path, token)
      : getJson<TeamResultsResponse>(path);

    request
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setActiveStageId((prev) => prev ?? res.stages[0]?.id ?? null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError) {
          if (err.status === 401) setGateMode('login');
          else if (err.status === 403) setGateMode('prompt');
          else if (err.status === 404) setNotFound(true);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, teamId, token, version]);

  async function handleForfeit() {
    if (!slug || !token) return;
    setForfeitLoading(true);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/forfeit`, token, {});
      window.location.reload();
    } finally {
      setForfeitLoading(false);
    }
  }

  if (loading) return <PageStateNotice message="Loading team results..." />;
  if (notFound) return <NotFoundPage />;

  if (gateMode === 'login') {
    const loginPath = `/login?redirect=${encodeURIComponent(location.pathname)}`;
    return <SpoilerGatePage mode="login" eventSlug={slug} loginPath={loginPath} />;
  }

  if (gateMode === 'prompt') {
    return (
      <SpoilerGatePage
        mode="prompt"
        eventSlug={slug}
        onForfeit={handleForfeit}
        loading={forfeitLoading}
      />
    );
  }

  if (!data) return <NotFoundPage />;

  const { team, stages } = data;
  const activeStage = stages.find((s) => s.id === activeStageId) ?? stages[0] ?? null;

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';
  const isMember = team.members.some((m) => m.user_id === user?.id);
  const canSubmit = (isAdmin || isMember) && !!token;

  const unplayedGames = activeStage?.games.filter((g) => g.score === null) ?? [];

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          {/* Breadcrumb */}
          <Text variant="caption">
            <Link to={`/events/${slug ?? ''}`}>← Back to event</Link>
          </Text>

          <Stack gap="lg">
            <Stack gap="sm">
              <Heading level={1}>{team.display_name}</Heading>
              <Inline gap="xs" wrap>
                {team.members.map((m) => (
                  <UserPill
                    key={m.user_id}
                    name={m.display_name}
                    color={m.color_hex}
                    textColor={m.text_color}
                    size="sm"
                  />
                ))}
              </Inline>
            </Stack>

            {stages.length === 0 ? (
              <Text variant="muted">No games available yet.</Text>
            ) : (
              <Stack gap="sm">
                {/* Stage tabs — only shown when there are multiple stages */}
                {stages.length > 1 ? (
                  <Tabs
                    items={stages.map((s) => ({
                      key: String(s.id),
                      label: s.label,
                      active: s.id === (activeStage?.id ?? null),
                      onSelect: () => setActiveStageId(s.id),
                    }))}
                  />
                ) : null}

                {activeStage ? (
                  <div
                    style={{ display: 'flex', gap: 'var(--ds-space-xl)', alignItems: 'flex-start' }}
                  >
                    {/* Game results table — 2/3 */}
                    <Stack gap="xs" style={{ flex: '2', minWidth: 0 }}>
                      {stages.length > 1 ? <Heading level={2}>{activeStage.label}</Heading> : null}
                      {activeStage.games.length === 0 ? (
                        <Text variant="muted">No games in this stage.</Text>
                      ) : (
                        <Table style={{ width: 'auto' }}>
                          <colgroup>
                            <col style={{ width: '2rem' }} />
                            <col style={{ width: '7rem' }} />
                            <col style={{ width: '4rem' }} />
                            <col style={{ width: '5rem' }} />
                            <col style={{ width: '9rem' }} />
                            <col style={{ width: '1.5rem' }} />
                          </colgroup>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>#</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Score</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>BDR</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Turns</Table.Th>
                              <Table.Th>Date</Table.Th>
                              <Table.Th></Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {activeStage.games.map((g) => {
                              const indexCell = g.effective_seed ? (
                                <a
                                  href={buildCreateTableUrl(
                                    g.effective_seed,
                                    g.effective_variant_name ?? 'No Variant',
                                    team.team_size,
                                  )}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {g.game_index + 1}
                                </a>
                              ) : (
                                g.game_index + 1
                              );

                              if (g.score === null) {
                                return (
                                  <Table.Tr key={g.game_index}>
                                    <Table.Td>{indexCell}</Table.Td>
                                    <Table.Td
                                      colSpan={4}
                                      style={{ color: 'var(--ds-color-text-muted)' }}
                                    >
                                      Not submitted
                                    </Table.Td>
                                    <Table.Td></Table.Td>
                                  </Table.Tr>
                                );
                              }
                              const isPerfect =
                                g.effective_max_score != null && g.score === g.effective_max_score;
                              const scoreDisplay =
                                g.effective_max_score != null
                                  ? `${g.score} / ${g.effective_max_score}`
                                  : String(g.score);
                              return (
                                <Table.Tr key={g.game_index}>
                                  <Table.Td>{indexCell}</Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {g.zero_reason ? (
                                      <Text variant="muted" style={{ fontStyle: 'italic' }}>
                                        0 / {g.effective_max_score ?? '?'} ({g.zero_reason})
                                      </Text>
                                    ) : (
                                      <Text style={isPerfect ? { fontWeight: 'bold' } : undefined}>
                                        {scoreDisplay}
                                      </Text>
                                    )}
                                  </Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>{g.bdr ?? '—'}</Table.Td>
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {g.turns_played ?? '—'}
                                  </Table.Td>
                                  <Table.Td>{formatDate(g.played_at)}</Table.Td>
                                  <Table.Td>
                                    {g.hanabi_live_game_id != null ? (
                                      <a
                                        href={`https://hanab.live/replay/${g.hanabi_live_game_id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        <IconExternalLink size={14} />
                                      </a>
                                    ) : null}
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Table.Tbody>
                        </Table>
                      )}
                    </Stack>

                    {/* Submission form — 1/3, sticky to top */}
                    {canSubmit && activeStage ? (
                      <div style={{ flex: '1', minWidth: 0, position: 'sticky', top: '1rem' }}>
                        <SubmissionForm
                          slug={slug!}
                          stageId={activeStage.id}
                          teamId={team.id}
                          unplayedGames={unplayedGames}
                          token={token!}
                          onSuccess={() => setVersion((v) => v + 1)}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Stack>
            )}
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
