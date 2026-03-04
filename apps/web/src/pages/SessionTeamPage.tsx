import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth } from '../lib/api';
import { useUserDirectory } from '../hooks/useUserDirectory';
import { UserPill } from '../features/users/UserPill';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  Input,
  PageContainer,
  Section,
  Stack,
  Text,
  Main,
  CoreTable as Table,
} from '../design-system';
import { PageStateNotice } from '../features/shared/PageStateNotice';

type SessionState = {
  session: {
    id: number;
    event_id: number;
    session_index: number;
    starts_at: string | null;
    ends_at: string | null;
    status: 'scheduled' | 'live' | 'closed';
  };
  rounds: Array<{
    id: number;
    round_index: number;
    seed_payload: string | null;
    status: 'pending' | 'assigning' | 'playing' | 'scoring' | 'finalized';
  }>;
  presence: Array<{
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    state: 'online' | 'offline';
    last_seen_at: string | null;
  }>;
  round_players: Array<{
    round_id: number;
    user_id: number;
    display_name: string;
    role: 'playing' | 'spectating';
    assigned_team_no: number | null;
  }>;
  round_results: Array<{
    round_id: number;
    team_no: number;
    score: number;
    submitted_at: string;
    submitted_by_user_id: number | null;
  }>;
};

export function SessionTeamPage() {
  const { slug, sessionId, roundId, teamNo } = useParams<{
    slug: string;
    sessionId: string;
    roundId: string;
    teamNo: string;
  }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { users: directory } = useUserDirectory();
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replayInput, setReplayInput] = useState('');
  const [replayGameId, setReplayGameId] = useState<string | null>(null);
  const [validateStatus, setValidateStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [validateMessage, setValidateMessage] = useState<string | null>(null);
  const [derivedScore, setDerivedScore] = useState<number | null>(null);
  const [derivedEndCondition, setDerivedEndCondition] = useState<string | null>(null);
  const [bdrInput, setBdrInput] = useState('');
  const [savingScore, setSavingScore] = useState(false);

  const sid = Number(sessionId);
  const rid = Number(roundId);
  const team = Number(teamNo);

  const loadState = useCallback(async () => {
    if (!auth.token || !Number.isInteger(sid) || sid <= 0) return;
    const resp = await getJsonAuth<SessionState>(
      `/session-ladder/sessions/${sid}/state`,
      auth.token,
    );
    setState(resp);
  }, [auth.token, sid]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!auth.token || !Number.isInteger(sid) || sid <= 0 || !slug) return;
      setLoading(true);
      setError(null);
      try {
        await loadState();
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof ApiError
            ? ((err.body as { error?: string })?.error ?? 'Failed to load team room')
            : 'Failed to load team room';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [auth.token, sid, slug, loadState]);

  useEffect(() => {
    if (!auth.token || !Number.isInteger(sid) || sid <= 0) return;
    const id = window.setInterval(() => {
      void loadState();
    }, 3000);
    return () => window.clearInterval(id);
  }, [auth.token, sid, loadState]);

  const round = useMemo(() => state?.rounds.find((r) => r.id === rid) ?? null, [state, rid]);
  const teamPlayers = useMemo(
    () =>
      (state?.round_players ?? []).filter(
        (p) =>
          p.round_id === rid &&
          p.role === 'playing' &&
          p.assigned_team_no != null &&
          Number(p.assigned_team_no) === team,
      ),
    [state, rid, team],
  );
  const myAssignment = teamPlayers.find((p) => p.user_id === auth.user?.id) ?? null;
  const submittedResult =
    (state?.round_results ?? []).find((r) => r.round_id === rid && r.team_no === team) ?? null;
  const sortedTeamPlayers = useMemo(
    () =>
      [...teamPlayers].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' }),
      ),
    [teamPlayers],
  );
  const teamName =
    sortedTeamPlayers.length > 0 ? `Team ${sortedTeamPlayers[0].display_name}` : `Team ${team}`;
  const captainUserId = sortedTeamPlayers[0]?.user_id ?? null;
  const isCaptain = captainUserId != null && auth.user?.id === captainUserId;
  const directoryByName = useMemo(() => {
    const map = new Map<string, { color_hex: string; text_color: string }>();
    directory.forEach((user) => {
      map.set(user.display_name.toLowerCase(), {
        color_hex: user.color_hex,
        text_color: user.text_color,
      });
    });
    return map;
  }, [directory]);

  useEffect(() => {
    if (!slug) return;
    if (submittedResult || round?.status === 'finalized') {
      navigate(`/events/${slug}`, { replace: true });
      return;
    }
    if (state && !myAssignment) {
      navigate(`/events/${slug}`, { replace: true });
    }
  }, [submittedResult, round?.status, myAssignment, state, slug, navigate]);

  useEffect(() => {
    setReplayInput('');
    setReplayGameId(null);
    setValidateStatus('idle');
    setValidateMessage(null);
    setDerivedScore(null);
    setDerivedEndCondition(null);
    setBdrInput('');
  }, [rid, team]);

  function parseGameId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const matchUrl = trimmed.match(/(?:replay|shared-replay)\/(\d+)/i);
    const matchId = trimmed.match(/^\d+$/);
    return matchUrl ? matchUrl[1] : matchId ? matchId[0] : null;
  }

  function mapEndCondition(code: number | null): string | null {
    if (code == null) return null;
    if (code === 1) return 'Perfect';
    if (code === 2) return 'Strike Out';
    if (code === 3) return 'Time Out';
    if (code === 4 || code === 10) return 'VTK';
    return String(code);
  }

  async function validateReplay(nextReplay: string) {
    setReplayInput(nextReplay);
    setError(null);

    const gameId = parseGameId(nextReplay);
    if (!nextReplay.trim()) {
      setReplayGameId(null);
      setValidateStatus('idle');
      setValidateMessage(null);
      setDerivedScore(null);
      setDerivedEndCondition(null);
      return;
    }
    if (!gameId) {
      setReplayGameId(null);
      setValidateStatus('error');
      setValidateMessage('Unable to parse game ID from replay link.');
      setDerivedScore(null);
      setDerivedEndCondition(null);
      return;
    }
    if (!auth.token || !Number.isInteger(rid) || rid <= 0 || !Number.isInteger(team) || team <= 0)
      return;

    setReplayGameId(gameId);
    setValidateStatus('loading');
    setValidateMessage(null);
    setDerivedScore(null);
    setDerivedEndCondition(null);
    try {
      const resp = await postJsonAuth<{
        ok: boolean;
        gameId: string;
        export: { players: string[]; seed: string };
        derived: {
          variant: string | null;
          score: number;
          endCondition: number | null;
          playedAt: string | null;
        };
      }>(`/session-ladder/rounds/${rid}/validate-replay`, auth.token, {
        team_no: team,
        replay: nextReplay,
      });
      if (!resp.ok) {
        setValidateStatus('error');
        setValidateMessage('Validation failed.');
        return;
      }
      setReplayInput(resp.gameId);
      setReplayGameId(resp.gameId);
      setValidateStatus('ok');
      setValidateMessage('Replay validated.');
      setDerivedScore(resp.derived.score);
      setDerivedEndCondition(mapEndCondition(resp.derived.endCondition));
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? `Validation failed (status ${err.status})`)
          : 'Validation failed.';
      setValidateStatus('error');
      setValidateMessage(msg);
      setDerivedScore(null);
      setDerivedEndCondition(null);
    }
  }

  async function submitScore() {
    if (!auth.token || !Number.isInteger(rid) || rid <= 0 || !Number.isInteger(team) || team <= 0)
      return;
    if (!replayGameId || validateStatus !== 'ok') {
      setError('Validate the replay first.');
      return;
    }
    if (derivedScore == null || !Number.isFinite(derivedScore)) {
      setError('Missing score from replay validation.');
      return;
    }
    setSavingScore(true);
    setError(null);
    try {
      await postJsonAuth(`/session-ladder/rounds/${rid}/submit-score`, auth.token, {
        team_no: team,
        score: derivedScore,
        replay_game_id: replayGameId ? Number(replayGameId) : null,
      });
      if (slug) navigate(`/events/${slug}`, { replace: true });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to submit score')
          : 'Failed to submit score';
      setError(msg);
    } finally {
      setSavingScore(false);
    }
  }

  if (!auth.token) {
    return (
      <PageStateNotice
        message={
          <Text variant="body">
            Please <Link to="/login">log in</Link> to access your team room.
          </Text>
        }
      />
    );
  }

  if (
    !Number.isInteger(sid) ||
    sid <= 0 ||
    !Number.isInteger(rid) ||
    rid <= 0 ||
    !Number.isInteger(team) ||
    team <= 0
  ) {
    return <PageStateNotice message="Invalid team room URL." />;
  }

  const seed = parseRoundSeedPayload(round?.seed_payload ?? null);
  const displayVariant = seed.variant.replace(/\s*\(#\d+\)\s*$/, '').trim();
  const captainCtaHref = buildCaptainCtaHref({
    isCaptain,
    seed: seed.seed || null,
    variantName: seed.variant || null,
    teamSize: Math.max(2, sortedTeamPlayers.length || 3),
  });
  const captainCtaLabel = 'Go to Game';

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          <Stack gap="md">
            {loading && <Text variant="muted">Loading team room…</Text>}
            {error && <Alert variant="error" message={error} />}

            {!loading && state && round && (
              <Card variant="outline" separated>
                <CardHeader>
                  <Stack gap="sm">
                    <Inline justify="space-between" align="center" wrap>
                      <Heading level={3}>{teamName}</Heading>
                      <Inline gap="xs" wrap>
                        <Button as={Link} to={`/events/${slug}`} variant="secondary" size="sm">
                          Back to Event
                        </Button>
                        <Button
                          as="a"
                          href={captainCtaHref}
                          target="_blank"
                          rel="noreferrer"
                          variant="primary"
                          size="sm"
                        >
                          {captainCtaLabel}
                        </Button>
                      </Inline>
                    </Inline>
                    {sortedTeamPlayers.length > 0 ? (
                      <Inline gap="xs" wrap>
                        {sortedTeamPlayers.map((player) => {
                          const userStyle = directoryByName.get(player.display_name.toLowerCase());
                          return (
                            <UserPill
                              key={player.user_id}
                              name={player.display_name}
                              color={userStyle?.color_hex}
                              textColor={userStyle?.text_color}
                              size="sm"
                            />
                          );
                        })}
                      </Inline>
                    ) : null}
                  </Stack>
                </CardHeader>
                <CardBody>
                  <Stack gap="sm">
                    <Heading level={4}>
                      {[displayVariant || 'Variant N/A', seed.seed || 'Seed N/A'].join(' · ')}
                    </Heading>
                    <Table>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Score</Table.Th>
                          <Table.Th>End</Table.Th>
                          <Table.Th>BDR</Table.Th>
                          <Table.Th>Replay</Table.Th>
                          <Table.Th />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        <Table.Tr>
                          <Table.Td>{derivedScore != null ? derivedScore : ''}</Table.Td>
                          <Table.Td>{derivedEndCondition ?? ''}</Table.Td>
                          <Table.Td style={{ minWidth: '7rem' }}>
                            <Input
                              value={bdrInput}
                              onChange={(e) => setBdrInput(e.target.value)}
                              placeholder="BDR"
                              fullWidth
                            />
                          </Table.Td>
                          <Table.Td style={{ minWidth: '13rem' }}>
                            <Input
                              value={replayInput}
                              onChange={(e) => void validateReplay(e.target.value)}
                              placeholder="Game ID or URL"
                              fullWidth
                            />
                          </Table.Td>
                          <Table.Td style={{ verticalAlign: 'bottom' }}>
                            <Button
                              variant="secondary"
                              onClick={() => void submitScore()}
                              disabled={
                                savingScore || validateStatus !== 'ok' || derivedScore == null
                              }
                            >
                              {savingScore ? 'Submitting…' : 'Submit Score'}
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                    {validateStatus === 'error' && validateMessage ? (
                      <Alert variant="error" message={validateMessage} />
                    ) : null}
                  </Stack>
                </CardBody>
              </Card>
            )}
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}

function parseRoundSeedPayload(seedPayload: string | null): { variant: string; seed: string } {
  if (!seedPayload) return { variant: '', seed: '' };
  try {
    const parsed = JSON.parse(seedPayload) as { variant?: unknown; seed?: unknown };
    return {
      variant: typeof parsed.variant === 'string' ? parsed.variant : '',
      seed: typeof parsed.seed === 'string' ? parsed.seed : '',
    };
  } catch {
    return { variant: '', seed: seedPayload };
  }
}

function buildCaptainCtaHref(input: {
  isCaptain: boolean;
  seed: string | null;
  variantName: string | null;
  teamSize: number;
}) {
  if (!input.isCaptain) return 'https://hanab.live/';

  const variantName = (input.variantName ?? '').replace(/\s*\(#\d+\)\s*$/, '').trim();
  const seed = (input.seed ?? '').trim();
  if (!variantName || !seed) {
    return 'https://hanab.live/';
  }

  const params = new URLSearchParams({
    name: `!seed ${seed}`,
    variantName,
    deckPlays: 'false',
    emptyClues: 'false',
    detrimentalCharacters: 'false',
    oneLessCard: 'false',
    oneExtraCard: 'false',
    allOrNothing: 'false',
    maxPlayers: String(input.teamSize),
  });
  const query = params.toString().replace(/\+/g, '%20');
  return `https://hanab.live/create-table?${query}`;
}
