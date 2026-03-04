import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth } from '../lib/api';
import { useEventDetail } from '../hooks/useEventDetail';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  Input,
  InputContainer,
  PageContainer,
  Section,
  Stack,
  Text,
  Main,
  CoreAnchor as Anchor,
  CoreBox as Box,
} from '../design-system';

type Access = {
  event_id: number;
  owner_user_id: number | null;
  can_manage: boolean;
  delegates: Array<{ user_id: number; display_name: string; role: string }>;
};

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
    replay_game_id: string | null;
  }>;
};

export function SessionLivePage() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId: string }>();
  const navigate = useNavigate();
  const auth = useAuth();
  const { event } = useEventDetail(slug);
  const [access, setAccess] = useState<Access | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'playing' | 'spectating'>('spectating');
  const [seedPayload, setSeedPayload] = useState('');
  const [scoreTeamNo, setScoreTeamNo] = useState('');
  const [scoreValue, setScoreValue] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const sid = Number(sessionId);

  const loadState = useCallback(async () => {
    if (!auth.token || !Number.isInteger(sid) || sid <= 0) return;
    const [accessResp, stateResp] = await Promise.all([
      getJsonAuth<Access>(
        `/session-ladder/events/${encodeURIComponent(String(slug))}/access`,
        auth.token,
      ),
      getJsonAuth<SessionState>(`/session-ladder/sessions/${sid}/state`, auth.token),
    ]);
    setAccess(accessResp);
    setState(stateResp);
  }, [auth.token, sid, slug]);

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
            ? ((err.body as { error?: string })?.error ?? 'Failed to load session state')
            : 'Failed to load session state';
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
    const id = window.setInterval(async () => {
      try {
        await postJsonAuth(`/session-ladder/sessions/${sid}/presence`, auth.token!, {
          role,
          state: 'online',
        });
        await loadState();
      } catch {
        // ignore heartbeat errors in interval
      }
    }, 15000);
    return () => window.clearInterval(id);
  }, [auth.token, sid, role, loadState]);

  const currentRound = useMemo(() => {
    if (!state?.rounds?.length) return null;
    return (
      state.rounds.find((r) => r.status === 'playing' || r.status === 'scoring') ??
      state.rounds.find((r) => r.status === 'pending') ??
      state.rounds[state.rounds.length - 1]
    );
  }, [state]);

  const currentRoundTeams = useMemo(() => {
    if (!state || !currentRound) return new Map<number, string[]>();
    const map = new Map<number, string[]>();
    state.round_players
      .filter(
        (p) => p.round_id === currentRound.id && p.role === 'playing' && p.assigned_team_no != null,
      )
      .forEach((p) => {
        const key = Number(p.assigned_team_no);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p.display_name);
      });
    return map;
  }, [state, currentRound]);

  const currentRoundResults = useMemo(() => {
    if (!state || !currentRound) return [];
    return state.round_results.filter((r) => r.round_id === currentRound.id);
  }, [state, currentRound]);

  useEffect(() => {
    if (!state || !auth.user || !slug) return;
    const me = state.presence.find((p) => p.user_id === auth.user?.id);
    if (me?.state === 'offline') {
      navigate(`/events/${slug}`, { replace: true });
    }
  }, [state, auth.user, slug, navigate]);

  async function setRoleOnServer(nextRole: 'playing' | 'spectating') {
    if (!auth.token) return;
    setRole(nextRole);
    await postJsonAuth(`/session-ladder/sessions/${sid}/role`, auth.token, { role: nextRole });
    await loadState();
  }

  async function managerAction(
    fn: () => Promise<unknown>,
    okMessage: string,
    errorFallback: string,
  ) {
    setMessage(null);
    setError(null);
    try {
      await fn();
      setMessage(okMessage);
      await loadState();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? errorFallback)
          : errorFallback;
      setError(msg);
    }
  }

  async function assignNextRound() {
    if (!auth.token) return;
    try {
      await postJsonAuth(`/session-ladder/sessions/${sid}/assign-next-round`, auth.token, {
        seed_payload: seedPayload || undefined,
      });
      setMessage('Round assignment started.');
      setError(null);
      await loadState();
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.status === 409 &&
        (err.body as { reason?: string })?.reason === 'MISSING_SCORES'
      ) {
        const missing = (err.body as { missing_teams?: number }).missing_teams ?? 0;
        const go = window.confirm(
          `${missing} team(s) are missing scores for the current round. Continue anyway?`,
        );
        if (!go) return;
        await postJsonAuth(`/session-ladder/sessions/${sid}/assign-next-round`, auth.token, {
          seed_payload: seedPayload || undefined,
          override_missing_scores: true,
          override_reason: 'manual_continue',
        });
        setMessage('Round assignment started with override.');
        setError(null);
        await loadState();
        return;
      }
      const msg =
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to assign next round')
          : 'Failed to assign next round';
      setError(msg);
    }
  }

  async function submitScore() {
    if (!auth.token || !currentRound) return;
    const teamNo = Number(scoreTeamNo);
    const score = Number(scoreValue);
    if (!Number.isInteger(teamNo) || teamNo <= 0 || !Number.isFinite(score)) {
      setError('Enter a valid team and score.');
      return;
    }
    await managerAction(
      () =>
        postJsonAuth(`/session-ladder/rounds/${currentRound.id}/submit-score`, auth.token!, {
          team_no: teamNo,
          score,
        }),
      'Score submitted.',
      'Failed to submit score',
    );
  }

  async function finalizeRound() {
    if (!auth.token || !currentRound) return;
    await managerAction(
      () => postJsonAuth(`/session-ladder/rounds/${currentRound.id}/finalize`, auth.token!, {}),
      'Round finalized.',
      'Failed to finalize round',
    );
  }

  if (!auth.token) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg">
            <Stack gap="sm">
              <Heading level={2}>Session</Heading>
              <Text variant="body">
                Please <Link to="/login">log in</Link> to access this session.
              </Text>
            </Stack>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  if (!Number.isInteger(sid) || sid <= 0) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg">
            <Text variant="body">Invalid session ID.</Text>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          <Stack gap="md">
            <Heading level={2}>Session</Heading>
            {event && (
              <Text variant="body">
                Event: <Link to={`/events/${event.slug}`}>{event.name}</Link>
              </Text>
            )}
            {loading && <Text variant="muted">Loading session state…</Text>}
            {message && <Alert variant="success" message={message} />}
            {error && <Alert variant="error" message={error} />}

            {!loading && state && (
              <>
                <Card variant="outline" separated>
                  <CardHeader>
                    <Heading level={4}>Session State</Heading>
                  </CardHeader>
                  <CardBody>
                    <Stack gap="sm">
                      <Text variant="body">Session #{state.session.session_index}</Text>
                      <Text variant="body">Status: {state.session.status}</Text>
                      <Text variant="body">Online users: {state.presence.length}</Text>
                      <Inline gap="sm" wrap>
                        <Button
                          variant={role === 'playing' ? 'secondary' : 'ghost'}
                          onClick={() => setRoleOnServer('playing')}
                        >
                          Playing
                        </Button>
                        <Button
                          variant={role === 'spectating' ? 'secondary' : 'ghost'}
                          onClick={() => setRoleOnServer('spectating')}
                        >
                          Spectating
                        </Button>
                      </Inline>
                    </Stack>
                  </CardBody>
                </Card>

                {access?.can_manage && (
                  <Card variant="outline" separated>
                    <CardHeader>
                      <Heading level={4}>Controls</Heading>
                    </CardHeader>
                    <CardBody>
                      <Stack gap="sm">
                        <Inline gap="sm" wrap>
                          <Button
                            variant="secondary"
                            onClick={() =>
                              managerAction(
                                () =>
                                  postJsonAuth(
                                    `/session-ladder/sessions/${sid}/start`,
                                    auth.token!,
                                    {},
                                  ),
                                'Session opened.',
                                'Failed to open session',
                              )
                            }
                          >
                            Open Session
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              managerAction(
                                () =>
                                  postJsonAuth(
                                    `/session-ladder/sessions/${sid}/close`,
                                    auth.token!,
                                    {},
                                  ),
                                'Session closed.',
                                'Failed to close session',
                              )
                            }
                          >
                            Close Session
                          </Button>
                        </Inline>
                        <InputContainer label="Seed Override (optional)">
                          <Input
                            value={seedPayload}
                            onChange={(e) => setSeedPayload(e.target.value)}
                            fullWidth
                          />
                        </InputContainer>
                        <Inline gap="sm" wrap>
                          <Button variant="secondary" onClick={assignNextRound}>
                            Assign Next Round
                          </Button>
                          <Button variant="ghost" onClick={finalizeRound} disabled={!currentRound}>
                            Finalize Current Round
                          </Button>
                        </Inline>
                      </Stack>
                    </CardBody>
                  </Card>
                )}

                <Card variant="outline" separated>
                  <CardHeader>
                    <Heading level={4}>Current Round</Heading>
                  </CardHeader>
                  <CardBody>
                    {!currentRound ? (
                      <Text variant="muted">No round available.</Text>
                    ) : (
                      <Stack gap="sm">
                        <Text variant="body">Round #{currentRound.round_index}</Text>
                        <Text variant="body">Status: {currentRound.status}</Text>
                        <Text variant="body">Seed: {currentRound.seed_payload ?? 'Not set'}</Text>

                        {[...currentRoundTeams.entries()].map(([teamNo, players]) => (
                          <Box key={teamNo}>
                            <Text variant="body">
                              Team {teamNo}: {players.join(', ')}
                            </Text>
                          </Box>
                        ))}

                        {currentRoundResults.length > 0 && (
                          <Stack gap="xs">
                            {currentRoundResults.map((r) => (
                              <Text key={`${r.round_id}-${r.team_no}`} variant="body">
                                Team {r.team_no}:{' '}
                                {r.submitted_by_user_id != null && r.replay_game_id ? (
                                  <Anchor
                                    href={`https://hanab.live/replay/${r.replay_game_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {r.score}
                                  </Anchor>
                                ) : (
                                  r.score
                                )}
                              </Text>
                            ))}
                          </Stack>
                        )}

                        <Inline gap="sm" wrap align="end">
                          <InputContainer label="Team #">
                            <Input
                              type="number"
                              value={scoreTeamNo}
                              onChange={(e) => setScoreTeamNo(e.target.value)}
                              fullWidth
                            />
                          </InputContainer>
                          <InputContainer label="Score">
                            <Input
                              type="number"
                              value={scoreValue}
                              onChange={(e) => setScoreValue(e.target.value)}
                              fullWidth
                            />
                          </InputContainer>
                          <Button variant="secondary" onClick={submitScore}>
                            Submit Score
                          </Button>
                        </Inline>
                      </Stack>
                    )}
                  </CardBody>
                </Card>
              </>
            )}
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}
