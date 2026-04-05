import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  PageContainer,
  SearchSelect,
  Section,
  Stack,
  Tabs,
  Text,
  CoreTable as Table,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { ApiError, getJson, getJsonAuth, postJsonAuth, deleteJsonAuth } from '../lib/api';
import { useUserDirectory, type UserDirectoryEntry } from '../hooks/useUserDirectory';
import { UserPill } from '../features/users/UserPill';
import { NotFoundPage } from './NotFoundPage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StageDetail = {
  id: number;
  label: string;
  mechanism: 'SEEDED_LEADERBOARD' | 'GAUNTLET' | 'MATCH_PLAY';
  team_scope: 'EVENT' | 'STAGE';
  participation_type: 'INDIVIDUAL' | 'TEAM';
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  game_slot_count: number;
  max_score?: number | null;
};

type GameSlot = {
  id: number;
  stage_id?: number;
  game_index: number;
  team_size: number | null;
  variant_id: number | null;
  seed_payload: string | null;
  max_score: number | null;
};

type ResultResponse = {
  id: number;
  event_team_id: number;
  stage_game_id: number;
  score: number;
  zero_reason: string | null;
  bottom_deck_risk: number | null;
  hanabi_live_game_id: number | null;
  participants: { user_id: number; display_name: string }[];
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

type OptIn = {
  id: number;
  user_id: number;
  partner_user_id: number | null;
  created_at: string;
};

type LeaderboardEntry = {
  rank: number;
  team_size: number;
  team: { id: number; display_name: string; members: { user_id: number; display_name: string }[] };
  stage_score: number;
  game_scores: { game_index: number; score: number; bdr: number | null }[];
};

type GauntletLeaderboardEntry = {
  rank: number | null;
  dnf: boolean;
  team_size: number;
  team: { id: number; display_name: string; members: { user_id: number; display_name: string }[] };
  stage_score: number | null;
  best_attempt_number: number | null;
  game_scores: { game_index: number; score: number; bdr: number | null }[];
};

type MatchStandingsEntry = {
  team: { id: number; display_name: string; members: { user_id: number; display_name: string }[] };
  status: 'active' | 'eliminated' | 'champion';
  placement: number | null;
};

type MatchGameResult = {
  id: number;
  game_index: number;
  team1_score: number | null;
  team2_score: number | null;
};

type StandingsMatch = {
  id: number;
  round_number: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  team1: { id: number; display_name: string };
  team2: { id: number; display_name: string };
  winner_team_id: number | null;
  game_results: MatchGameResult[];
};

type MatchPlayStandings = {
  rounds: { round_number: number; matches: StandingsMatch[] }[];
  entries: MatchStandingsEntry[];
  current_round: number | null;
};

type LeaderboardData =
  | { combined_leaderboard: boolean; entries: LeaderboardEntry[] }
  | { entries: GauntletLeaderboardEntry[] }
  | MatchPlayStandings;

type AttemptRow = {
  id: number;
  event_team_id: number;
  stage_id: number;
  attempt_number: number;
  completed: boolean;
  abandoned: boolean;
  total_score: number | null;
  started_at: string;
  completed_at: string | null;
};

type AttemptDetail = AttemptRow & {
  results: ResultResponse[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function stageDateRange(stage: StageDetail): string | null {
  if (stage.starts_at && stage.ends_at) {
    return `${formatDate(stage.starts_at)} — ${formatDate(stage.ends_at)}`;
  }
  if (stage.starts_at) return `Starts ${formatDate(stage.starts_at)}`;
  if (stage.ends_at) return `Ends ${formatDate(stage.ends_at)}`;
  return null;
}

// ---------------------------------------------------------------------------
// Result submission form (T-062)
// ---------------------------------------------------------------------------

const ZERO_REASON_OPTIONS = [
  { value: 'STRIKE_OUT', label: 'Strike Out' },
  { value: 'TIME_OUT', label: 'Time Out' },
  { value: 'VTK', label: 'VTK' },
];

type ResultFormState = {
  score: string;
  bdr: string;
  zeroReason: string;
  hanabiLiveGameId: string;
};

type ResultFormProps = {
  game: GameSlot;
  teamId: number;
  slug: string;
  token: string;
  existingResult: ResultResponse | null;
  onSuccess: (result: ResultResponse) => void;
  attemptId?: number;
};

function ResultForm({
  game,
  teamId,
  slug,
  token,
  existingResult,
  onSuccess,
  attemptId,
}: ResultFormProps) {
  const [form, setForm] = useState<ResultFormState>({
    score: existingResult != null ? String(existingResult.score) : '',
    bdr: existingResult?.bottom_deck_risk != null ? String(existingResult.bottom_deck_risk) : '',
    zeroReason: existingResult?.zero_reason ?? '',
    hanabiLiveGameId:
      existingResult?.hanabi_live_game_id != null ? String(existingResult.hanabi_live_game_id) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(existingResult == null);

  const scoreNum = form.score !== '' ? Number(form.score) : null;
  const maxScore = game.max_score;

  function validate(): string | null {
    if (form.score === '') return 'Score is required.';
    if (!Number.isInteger(scoreNum) || scoreNum! < 0)
      return 'Score must be a non-negative integer.';
    if (maxScore != null && scoreNum! > maxScore) return `Score cannot exceed ${maxScore}.`;
    if (scoreNum === 0 && !form.zeroReason) return 'Zero reason is required when score is 0.';
    if (form.bdr !== '' && (!Number.isInteger(Number(form.bdr)) || Number(form.bdr) < 0)) {
      return 'BDR must be a non-negative integer.';
    }
    if (form.hanabiLiveGameId !== '' && !/^\d+$/.test(form.hanabiLiveGameId)) {
      return 'Hanabi.live game ID must be a number.';
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await postJsonAuth<ResultResponse>(
        `/events/${encodeURIComponent(slug)}/stages/${game.stage_id ?? ''}/games/${game.id}/results`,
        token,
        {
          team_id: teamId,
          score: Number(form.score),
          zero_reason: scoreNum === 0 ? form.zeroReason : null,
          bottom_deck_risk: form.bdr !== '' ? Number(form.bdr) : null,
          hanabi_live_game_id: form.hanabiLiveGameId !== '' ? Number(form.hanabiLiveGameId) : null,
          attempt_id: attemptId ?? null,
        },
      );
      setEditing(false);
      onSuccess(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Submission failed.')
          : 'Submission failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  // Submitted view
  if (!editing && existingResult) {
    return (
      <Stack gap="xs">
        <Inline gap="sm" wrap>
          <Text variant="body">
            Score: <strong>{existingResult.score}</strong>
          </Text>
          {existingResult.bottom_deck_risk != null ? (
            <Text variant="caption">BDR: {existingResult.bottom_deck_risk}</Text>
          ) : null}
          {existingResult.zero_reason ? (
            <Text variant="caption">({existingResult.zero_reason.replace('_', ' ')})</Text>
          ) : null}
          {existingResult.hanabi_live_game_id != null ? (
            <Text variant="caption">
              <a
                href={`https://hanabi.live/replay/${existingResult.hanabi_live_game_id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View replay
              </a>
            </Text>
          ) : null}
        </Inline>
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      {error ? <Alert variant="error" message={error} /> : null}

      <Inline gap="sm" wrap>
        <Stack gap="xs">
          <Text variant="label">Score{maxScore != null ? ` (0–${maxScore})` : ''}</Text>
          <input
            type="number"
            min={0}
            max={maxScore ?? undefined}
            value={form.score}
            onChange={(e) => {
              setForm((f) => ({
                ...f,
                score: e.target.value.replace(/[^\d]/g, ''),
                zeroReason: e.target.value === '0' ? f.zeroReason : '',
              }));
            }}
            style={{ width: 80 }}
          />
        </Stack>

        <Stack gap="xs">
          <Text variant="label">BDR (optional)</Text>
          <input
            type="number"
            min={0}
            value={form.bdr}
            onChange={(e) => setForm((f) => ({ ...f, bdr: e.target.value.replace(/[^\d]/g, '') }))}
            style={{ width: 60 }}
          />
        </Stack>

        <Stack gap="xs">
          <Text variant="label">Hanabi.live ID (optional)</Text>
          <input
            type="text"
            value={form.hanabiLiveGameId}
            onChange={(e) =>
              setForm((f) => ({ ...f, hanabiLiveGameId: e.target.value.replace(/[^\d]/g, '') }))
            }
            style={{ width: 100 }}
          />
        </Stack>
      </Inline>

      {scoreNum === 0 && form.score !== '' ? (
        <Stack gap="xs">
          <Text variant="label">Zero Reason</Text>
          <select
            value={form.zeroReason}
            onChange={(e) => setForm((f) => ({ ...f, zeroReason: e.target.value }))}
          >
            <option value="">Select reason…</option>
            {ZERO_REASON_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Stack>
      ) : null}

      <Inline gap="xs">
        <Button size="sm" onClick={() => void handleSubmit()} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit'}
        </Button>
        {existingResult ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </Inline>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Stage participation section (T-060) — STAGE scope
// ---------------------------------------------------------------------------

type ParticipationMode = 'choose' | 'partner' | 'queue' | 'out';

type StageParticipationProps = {
  slug: string;
  stageId: number;
  token: string;
  userId: number;
  stageTeam: TeamResponse | null;
  optIn: OptIn | null;
  onTeamChange: () => void;
};

function StageParticipation({
  slug,
  stageId,
  token,
  userId,
  stageTeam,
  optIn,
  onTeamChange,
}: StageParticipationProps) {
  const { users: allUsers } = useUserDirectory();
  const [mode, setMode] = useState<ParticipationMode>('choose');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partner, setPartner] = useState<UserDirectoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // If already have a team or opt-in, show status
  if (stageTeam) {
    return (
      <Stack gap="xs">
        <Heading level={4}>Playing this week?</Heading>
        {stageTeam.all_confirmed ? (
          <Stack gap="xs">
            <Text variant="body">
              Your team: <strong>{stageTeam.display_name}</strong>
            </Text>
            <Inline gap="xs" wrap>
              {stageTeam.members.map((m) => (
                <UserPill key={m.user_id} name={m.display_name} />
              ))}
            </Inline>
          </Stack>
        ) : (
          <Stack gap="xs">
            <Text variant="body">Team invite pending — waiting for all members to confirm.</Text>
            <Text variant="muted">{stageTeam.display_name}</Text>
          </Stack>
        )}
      </Stack>
    );
  }

  if (optIn) {
    async function handleOptOut() {
      setBusy(true);
      setActionError(null);
      try {
        await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/opt-in`, token);
        onTeamChange();
      } catch {
        setActionError('Failed to opt out.');
      } finally {
        setBusy(false);
      }
    }

    return (
      <Stack gap="xs">
        <Heading level={4}>Playing this week?</Heading>
        {actionError ? <Alert variant="error" message={actionError} /> : null}
        <Text variant="body">
          {optIn.partner_user_id
            ? 'You have indicated a preferred partner.'
            : "You are in the solo queue. You'll be paired before the stage begins."}
        </Text>
        <Button size="sm" variant="outline" onClick={() => void handleOptOut()} disabled={busy}>
          {busy ? 'Withdrawing…' : 'Withdraw opt-in'}
        </Button>
      </Stack>
    );
  }

  async function handleCreateTeam() {
    if (!partner) return;
    setBusy(true);
    setActionError(null);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/teams`, token, {
        invite_user_ids: [partner.id],
      });
      setPartner(null);
      setPartnerSearch('');
      setMode('choose');
      onTeamChange();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to create team.')
          : 'Failed to create team.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleOptIn(partnerUserId: number | null) {
    setBusy(true);
    setActionError(null);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/opt-in`, token, {
        partner_user_id: partnerUserId,
      });
      setMode('choose');
      onTeamChange();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to opt in.')
          : 'Failed to opt in.',
      );
    } finally {
      setBusy(false);
    }
  }

  const partnerSuggestions = allUsers
    .filter((u) => u.id !== userId && u.id !== partner?.id)
    .filter((u) => u.display_name.toLowerCase().includes(partnerSearch.toLowerCase()))
    .map((u) => ({
      key: u.id,
      value: u,
      node: <UserPill name={u.display_name} color={u.color_hex} textColor={u.text_color} />,
    }));

  return (
    <Stack gap="sm">
      <Heading level={4}>Playing this week?</Heading>
      {actionError ? <Alert variant="error" message={actionError} /> : null}

      {mode === 'choose' ? (
        <Stack gap="xs">
          <Button size="sm" onClick={() => setMode('partner')}>
            I have a partner
          </Button>
          <Button size="sm" variant="outline" onClick={() => void handleOptIn(null)}>
            I need a partner
          </Button>
          <Button size="sm" variant="subtle" onClick={() => setMode('out')}>
            Sitting out this week
          </Button>
        </Stack>
      ) : mode === 'partner' ? (
        <Stack gap="xs">
          <Text variant="label">Search for your partner</Text>
          <SearchSelect
            value={partnerSearch}
            onChange={setPartnerSearch}
            suggestions={partnerSuggestions}
            onSelect={(u) => {
              setPartner(u);
              setPartnerSearch('');
            }}
            blurOnSelect
            maxSelections={1}
            selectedCount={partner ? 1 : 0}
            placeholder="Search by name…"
            tokens={
              partner
                ? [
                    <UserPill
                      key={partner.id}
                      name={partner.display_name}
                      color={partner.color_hex}
                      textColor={partner.text_color}
                      trailingIcon={<span>×</span>}
                      onClick={() => setPartner(null)}
                    />,
                  ]
                : []
            }
          />
          <Inline gap="xs">
            <Button size="sm" onClick={() => void handleCreateTeam()} disabled={busy || !partner}>
              {busy ? 'Inviting…' : 'Invite Partner'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMode('choose');
                setPartner(null);
                setPartnerSearch('');
              }}
            >
              Back
            </Button>
          </Inline>
        </Stack>
      ) : mode === 'out' ? (
        <Stack gap="xs">
          <Text variant="body">No action needed — sit this one out.</Text>
          <Button size="sm" variant="outline" onClick={() => setMode('choose')}>
            Back
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// GAUNTLET section (T-063)
// ---------------------------------------------------------------------------

type GauntletSectionProps = {
  slug: string;
  stageId: number;
  token: string;
  games: GameSlot[];
  myTeamId: number | null;
  version: number;
  onVersionChange: () => void;
};

function GauntletSection({
  slug,
  stageId,
  token,
  games,
  myTeamId,
  version,
  onVersionChange,
}: GauntletSectionProps) {
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [activeAttempt, setActiveAttempt] = useState<AttemptDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getJsonAuth<AttemptRow[]>(
          `/events/${encodeURIComponent(slug)}/stages/${stageId}/attempts`,
          token,
        ).catch(() => [] as AttemptRow[]);
        if (!cancelled) setAttempts(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, version]);

  // Find active (in-progress) attempt
  const inProgress = attempts.find((a) => !a.completed && !a.abandoned) ?? null;

  // Load detail for in-progress attempt
  useEffect(() => {
    if (!inProgress) {
      setActiveAttempt(null);
      return;
    }
    let cancelled = false;
    getJsonAuth<AttemptDetail>(
      `/events/${encodeURIComponent(slug)}/stages/${stageId}/attempts/${inProgress.id}`,
      token,
    )
      .then((d) => {
        if (!cancelled) setActiveAttempt(d);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, inProgress]);

  const completedAttempts = attempts.filter((a) => a.completed);
  const bestAttempt = completedAttempts.reduce<AttemptRow | null>(
    (best, a) =>
      a.total_score != null && (best == null || a.total_score > (best.total_score ?? 0)) ? a : best,
    null,
  );

  async function handleStartAttempt() {
    setBusy(true);
    setError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/attempts`,
        token,
        {},
      );
      onVersionChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to start attempt.')
          : 'Failed to start attempt.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleCompleteAttempt(attemptId: number) {
    setBusy(true);
    setError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/attempts/${attemptId}/complete`,
        token,
        {},
      );
      onVersionChange();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to complete attempt.')
          : 'Failed to complete attempt.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Text variant="muted">Loading attempts…</Text>;

  // Determine which game slot is next for submission (first without a result)
  const submittedGameIds = new Set((activeAttempt?.results ?? []).map((r) => r.stage_game_id));
  const nextGame = games.find((g) => !submittedGameIds.has(g.id)) ?? null;

  return (
    <Stack gap="md">
      {error ? <Alert variant="error" message={error} /> : null}

      {/* Best attempt */}
      <Card variant="outline">
        <CardBody>
          <Stack gap="xs">
            <Text variant="label">Current Best</Text>
            {bestAttempt ? (
              <Text variant="body">
                Score: <strong>{bestAttempt.total_score}</strong> (Attempt #
                {bestAttempt.attempt_number})
              </Text>
            ) : (
              <Text variant="muted">No complete attempt yet.</Text>
            )}
          </Stack>
        </CardBody>
      </Card>

      {/* Active attempt */}
      {inProgress && activeAttempt ? (
        <Stack gap="sm">
          <Heading level={3}>Attempt #{inProgress.attempt_number} — In Progress</Heading>
          {games.map((game, idx) => {
            const submitted = submittedGameIds.has(game.id);
            const isNext = game === nextGame;
            const existingResult =
              activeAttempt.results.find((r) => r.stage_game_id === game.id) ?? null;

            return (
              <Card key={game.id} variant="outline">
                <CardHeader>
                  <Inline gap="xs" justify="space-between" wrap>
                    <Text variant="body">
                      Game {idx + 1}
                      {game.seed_payload ? ` — Seed: ${game.seed_payload}` : ''}
                    </Text>
                    <Badge size="sm" tone={submitted ? 'success' : undefined}>
                      {submitted ? 'Submitted' : isNext ? 'Up next' : 'Locked'}
                    </Badge>
                  </Inline>
                </CardHeader>
                {isNext && myTeamId ? (
                  <CardBody>
                    <ResultForm
                      game={{ ...game, stage_id: stageId }}
                      teamId={myTeamId}
                      slug={slug}
                      token={token}
                      existingResult={existingResult}
                      onSuccess={() => {
                        // Reload attempt detail
                        getJsonAuth<AttemptDetail>(
                          `/events/${encodeURIComponent(slug)}/stages/${stageId}/attempts/${inProgress.id}`,
                          token,
                        )
                          .then((d) => setActiveAttempt(d))
                          .catch(() => null);
                      }}
                      attemptId={inProgress.id}
                    />
                  </CardBody>
                ) : submitted ? (
                  <CardBody>
                    <Text variant="caption">
                      Score: {existingResult?.score ?? '—'}
                      {existingResult?.bottom_deck_risk != null
                        ? ` · BDR: ${existingResult.bottom_deck_risk}`
                        : ''}
                    </Text>
                  </CardBody>
                ) : null}
              </Card>
            );
          })}

          {/* Complete attempt button (all games submitted) */}
          {nextGame == null ? (
            <Button
              size="sm"
              onClick={() => void handleCompleteAttempt(inProgress.id)}
              disabled={busy}
            >
              {busy ? 'Completing…' : 'Complete Attempt'}
            </Button>
          ) : null}
        </Stack>
      ) : myTeamId ? (
        <Button size="sm" onClick={() => void handleStartAttempt()} disabled={busy}>
          {busy ? 'Starting…' : 'Start New Attempt'}
        </Button>
      ) : null}

      {/* Attempt history */}
      {attempts.length > 0 ? (
        <Stack gap="xs">
          <Heading level={3}>Attempt History</Heading>
          {attempts
            .filter((a) => a.completed || a.abandoned)
            .map((a) => (
              <Card key={a.id} variant="outline">
                <CardBody>
                  <Inline gap="sm">
                    <Text variant="body">
                      Attempt #{a.attempt_number}:{' '}
                      {a.abandoned ? (
                        <em>Abandoned</em>
                      ) : (
                        <strong>Score {a.total_score ?? '—'}</strong>
                      )}
                    </Text>
                  </Inline>
                </CardBody>
              </Card>
            ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// MATCH_PLAY section (T-064)
// ---------------------------------------------------------------------------

type MatchPlaySectionProps = {
  standings: MatchPlayStandings;
  userId: number | undefined;
  hideStandings?: boolean;
};

function MatchPlaySection({ standings, userId, hideStandings }: MatchPlaySectionProps) {
  // Find user's team from entries
  const myTeamEntry = standings.entries.find((e) =>
    e.team.members.some((m) => m.user_id === userId),
  );
  const myTeamId = myTeamEntry?.team.id;

  return (
    <Stack gap="md">
      {/* Bracket rounds */}
      {standings.rounds.map((round) => (
        <Stack key={round.round_number} gap="sm">
          <Heading level={3}>Round {round.round_number}</Heading>
          {round.matches.map((match) => {
            const isMyMatch =
              myTeamId != null && (match.team1.id === myTeamId || match.team2.id === myTeamId);
            return (
              <Card key={match.id} variant={isMyMatch ? 'accent' : 'outline'}>
                <CardBody>
                  <Stack gap="xs">
                    <Inline gap="sm" justify="space-between" wrap>
                      <Text variant="body">
                        <strong>{match.team1.display_name}</strong>
                        {' vs '}
                        <strong>{match.team2.display_name}</strong>
                      </Text>
                      <Badge size="sm" tone={match.status === 'IN_PROGRESS' ? 'info' : undefined}>
                        {match.status === 'COMPLETE'
                          ? 'Complete'
                          : match.status === 'IN_PROGRESS'
                            ? 'In Progress'
                            : 'Pending'}
                      </Badge>
                    </Inline>

                    {match.game_results.length > 0 ? (
                      <Stack gap="xs">
                        {match.game_results.map((gr) => (
                          <Text key={gr.id} variant="caption">
                            Game {gr.game_index}: {match.team1.display_name} {gr.team1_score ?? '?'}{' '}
                            — {gr.team2_score ?? '?'} {match.team2.display_name}
                          </Text>
                        ))}
                      </Stack>
                    ) : null}

                    {match.winner_team_id ? (
                      <Text variant="caption">
                        Winner:{' '}
                        {match.team1.id === match.winner_team_id
                          ? match.team1.display_name
                          : match.team2.display_name}
                      </Text>
                    ) : null}
                  </Stack>
                </CardBody>
              </Card>
            );
          })}
        </Stack>
      ))}

      {/* Standings */}
      {!hideStandings && standings.entries.length > 0 ? (
        <Stack gap="sm">
          <Heading level={3}>Standings</Heading>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Team</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {standings.entries.map((entry) => {
                const isMe = userId != null && entry.team.members.some((m) => m.user_id === userId);
                return (
                  <Table.Tr key={entry.team.id} style={isMe ? { fontWeight: 'bold' } : {}}>
                    <Table.Td>{entry.team.display_name}</Table.Td>
                    <Table.Td>
                      {entry.status === 'champion'
                        ? '🏆 Champion'
                        : entry.status === 'active'
                          ? 'Active'
                          : `Eliminated (${entry.placement != null ? `#${entry.placement}` : '—'})`}
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Stack>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function StageDetailPage() {
  const { slug, stageId: stageIdParam } = useParams<{ slug: string; stageId: string }>();
  const { user, token } = useAuth();
  const stageId = Number(stageIdParam);

  // Public data
  const [stage, setStage] = useState<StageDetail | null>(null);
  const [allStages, setAllStages] = useState<StageDetail[]>([]);
  const [games, setGames] = useState<GameSlot[]>([]);
  const [lbByStage, setLbByStage] = useState<Map<number, LeaderboardData | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auth data
  const [registered, setRegistered] = useState(false);
  const [stageTeam, setStageTeam] = useState<TeamResponse | null>(null);
  const [optIn, setOptIn] = useState<OptIn | null>(null);
  const [myResults, setMyResults] = useState<Map<number, ResultResponse>>(new Map());
  const [authVersion, setAuthVersion] = useState(0);

  // Leaderboard tab selection (must be before early returns)
  const [activeLbStageId, setActiveLbStageId] = useState<number | null>(null);
  const [activeLbSize, setActiveLbSize] = useState<number | null>(null);

  // Load public data
  useEffect(() => {
    if (!slug || !stageId) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      setNotFound(false);
      try {
        const [stagesData, gamesData, lbData] = await Promise.all([
          getJson<StageDetail[]>(`/events/${encodeURIComponent(slug!)}/stages`),
          getJson<GameSlot[]>(`/events/${encodeURIComponent(slug!)}/stages/${stageId}/games`),
          getJson<LeaderboardData>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/leaderboard`,
          ).catch(() => null),
        ]);
        if (!cancelled) {
          const found = stagesData.find((s) => s.id === stageId) ?? null;
          if (!found) {
            setNotFound(true);
          } else {
            setStage(found);
            setAllStages(stagesData);
            setGames(gamesData);
            setLbByStage(new Map([[stageId, lbData]]));
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setNotFound(true);
          } else {
            setLoadError('Failed to load stage.');
          }
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId]);

  // Load auth data
  useEffect(() => {
    if (!slug || !stageId || !token) return;
    let cancelled = false;

    async function loadAuth() {
      try {
        // Check registration
        const regData = await getJsonAuth<{ status: string }>(
          `/events/${encodeURIComponent(slug!)}/registrations/me`,
          token as string,
        ).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          return null;
        });

        if (!cancelled) setRegistered(regData?.status === 'ACTIVE');

        if (regData?.status !== 'ACTIVE') return;

        // Stage team
        const teamData = await getJsonAuth<TeamResponse>(
          `/events/${encodeURIComponent(slug!)}/stages/${stageId}/teams/me`,
          token as string,
        ).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          return null;
        });
        if (!cancelled) setStageTeam(teamData);

        // Opt-in (only for QUEUED policy stages)
        const optInData = await getJsonAuth<OptIn>(
          `/events/${encodeURIComponent(slug!)}/stages/${stageId}/opt-ins/me`,
          token as string,
        ).catch((err) => {
          if (err instanceof ApiError && err.status === 404) return null;
          return null;
        });
        if (!cancelled) setOptIn(optInData);
      } catch {
        // ignore
      }
    }

    loadAuth();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, authVersion]);

  // Load results for each game (auth required)
  useEffect(() => {
    if (!slug || !stageId || !token || games.length === 0) return;
    let cancelled = false;

    async function loadResults() {
      const resultEntries = await Promise.all(
        games.map(async (game) => {
          const results = await getJsonAuth<ResultResponse[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/games/${game.id}/results`,
            token as string,
          ).catch(() => [] as ResultResponse[]);
          // Own result is the first one (GET /results for non-admins returns only user's result)
          return [game.id, results[0] ?? null] as [number, ResultResponse | null];
        }),
      );
      if (!cancelled) {
        const map = new Map<number, ResultResponse>();
        for (const [gameId, result] of resultEntries) {
          if (result) map.set(gameId, result);
        }
        setMyResults(map);
      }
    }

    loadResults();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, games, authVersion]);

  function handleTeamChange() {
    setAuthVersion((v) => v + 1);
  }

  function handleResultSuccess(gameId: number, result: ResultResponse) {
    setMyResults((prev) => new Map(prev).set(gameId, result));
    // Refresh leaderboard for the current stage
    if (slug && stageId) {
      getJson<LeaderboardData>(`/events/${encodeURIComponent(slug)}/stages/${stageId}/leaderboard`)
        .then((lb) => setLbByStage((prev) => new Map(prev).set(stageId, lb)))
        .catch(() => null);
    }
  }

  // Lazy-load leaderboard for other stages when a stage tab is selected
  useEffect(() => {
    const id = activeLbStageId ?? stageId;
    if (!slug || !id || lbByStage.has(id)) return;
    getJson<LeaderboardData>(`/events/${encodeURIComponent(slug)}/stages/${id}/leaderboard`)
      .then((lb) => setLbByStage((prev) => new Map(prev).set(id, lb)))
      .catch(() => setLbByStage((prev) => new Map(prev).set(id, null)));
  }, [slug, stageId, activeLbStageId, lbByStage]);

  // Derive team_id for result submission (from stage team or event team)
  const myTeamId = stageTeam?.all_confirmed ? stageTeam.id : null;

  if (loading) {
    return (
      <Main>
        <PageContainer>
          <Text variant="muted">Loading…</Text>
        </PageContainer>
      </Main>
    );
  }

  if (notFound) return <NotFoundPage />;

  if (loadError || !stage) {
    return (
      <Main>
        <PageContainer>
          <Alert variant="error" message={loadError ?? 'Failed to load stage.'} />
        </PageContainer>
      </Main>
    );
  }

  const dateRange = stageDateRange(stage);
  const isStageScope = stage.team_scope === 'STAGE';
  const isQueuedPolicy = stage.participation_type === 'INDIVIDUAL';
  const showParticipation =
    registered &&
    token &&
    user &&
    (isStageScope || isQueuedPolicy) &&
    (stage.status === 'UPCOMING' || stage.status === 'IN_PROGRESS');

  // Active leaderboard stage (may differ from current URL stage via stage tabs)
  const effectiveLbStageId = activeLbStageId ?? stageId;
  const activeLbStage = allStages.find((s) => s.id === effectiveLbStageId) ?? stage;
  const activeLb = lbByStage.get(effectiveLbStageId) ?? null;
  const isIndividualLbStage = activeLbStage?.participation_type === 'INDIVIDUAL';

  // SEEDED leaderboard entries
  const seededLb =
    activeLbStage?.mechanism === 'SEEDED_LEADERBOARD' &&
    activeLb != null &&
    'combined_leaderboard' in activeLb
      ? (activeLb as { combined_leaderboard: boolean; entries: LeaderboardEntry[] })
      : null;
  const seededEntries = seededLb?.entries ?? [];

  // GAUNTLET leaderboard entries
  const gauntletLb =
    activeLbStage?.mechanism === 'GAUNTLET' &&
    activeLb != null &&
    !('combined_leaderboard' in activeLb) &&
    !('rounds' in activeLb)
      ? (activeLb as { entries: GauntletLeaderboardEntry[] })
      : null;
  const gauntletEntries = gauntletLb?.entries ?? [];

  // MATCH_PLAY standings
  const matchPlayStandings =
    activeLbStage?.mechanism === 'MATCH_PLAY' && activeLb != null && 'rounds' in activeLb
      ? (activeLb as MatchPlayStandings)
      : null;

  // Current URL stage's MATCH_PLAY standings (for the bracket rounds section)
  const currentStageMatchPlay =
    stage.mechanism === 'MATCH_PLAY' &&
    lbByStage.get(stageId) != null &&
    'rounds' in (lbByStage.get(stageId) ?? {})
      ? (lbByStage.get(stageId) as MatchPlayStandings)
      : null;

  // Size tabs: applicable for SEEDED (non-combined) and GAUNTLET
  const sizeCandidates: number[] = seededLb
    ? [...new Set(seededEntries.map((e) => e.team_size))].sort((a, b) => a - b)
    : gauntletLb
      ? [...new Set(gauntletEntries.map((e) => e.team_size))].sort((a, b) => a - b)
      : [];
  const showSizeTabs = sizeCandidates.length > 1 && !(seededLb?.combined_leaderboard ?? false);
  const effectiveLbSize = showSizeTabs ? (activeLbSize ?? sizeCandidates[0]) : null;

  // Filter entries by size
  const filteredSeededEntries =
    effectiveLbSize != null
      ? seededEntries.filter((e) => e.team_size === effectiveLbSize)
      : seededEntries;
  const filteredGauntletEntries =
    effectiveLbSize != null
      ? gauntletEntries.filter((e) => e.team_size === effectiveLbSize)
      : gauntletEntries;

  // For individual stages, expand team entries into per-player rows
  type IndividualRow = {
    rank: number;
    name: string;
    stage_score: number;
    game_scores: { game_index: number; score: number; bdr: number | null }[];
    isMe: boolean;
  };
  function toIndividualRows(entries: LeaderboardEntry[]): IndividualRow[] {
    return entries.flatMap((e) =>
      e.team.members.map((m) => ({
        rank: e.rank,
        name: m.display_name,
        stage_score: e.stage_score,
        game_scores: e.game_scores,
        isMe: m.user_id === user?.id,
      })),
    );
  }
  type GauntletIndividualRow = {
    rank: number | null;
    dnf: boolean;
    name: string;
    stage_score: number | null;
    game_scores: { game_index: number; score: number; bdr: number | null }[];
    isMe: boolean;
  };
  function toGauntletIndividualRows(entries: GauntletLeaderboardEntry[]): GauntletIndividualRow[] {
    return entries.flatMap((e) =>
      e.team.members.map((m) => ({
        rank: e.rank,
        dnf: e.dnf,
        name: m.display_name,
        stage_score: e.stage_score,
        game_scores: e.game_scores,
        isMe: m.user_id === user?.id,
      })),
    );
  }

  // Stage tabs: show if more than one stage
  const showStageTabs = allStages.length > 1;

  // Show the leaderboard section whenever a fetch was attempted (activeLb not undefined in the map)
  const lbFetched = lbByStage.has(effectiveLbStageId);
  const hasLbEntries =
    filteredSeededEntries.length > 0 ||
    filteredGauntletEntries.length > 0 ||
    (matchPlayStandings?.entries.length ?? 0) > 0;

  // Game columns: derive from entry game_scores (works for any stage, not just current)
  const gameIndices = games.map((g) => g.game_index);

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg">
          {/* Breadcrumb */}
          <Text variant="caption">
            <Link to={`/events/${slug ?? ''}`}>← Back to event</Link>
          </Text>

          {/* Stage header */}
          <Stack gap="sm">
            <Heading level={1}>{stage.label}</Heading>
            <Inline gap="xs" wrap>
              <Badge size="sm">{stage.status}</Badge>
              <Badge size="sm">
                {stage.mechanism === 'SEEDED_LEADERBOARD'
                  ? 'Leaderboard'
                  : stage.mechanism === 'GAUNTLET'
                    ? 'Gauntlet'
                    : 'Match Play'}
              </Badge>
            </Inline>
            {dateRange ? <Text variant="caption">{dateRange}</Text> : null}
          </Stack>

          {/* T-060: Stage participation flow */}
          {showParticipation ? (
            <Card variant="outline">
              <CardBody>
                <StageParticipation
                  slug={slug!}
                  stageId={stageId}
                  token={token}
                  userId={user!.id}
                  stageTeam={stageTeam}
                  optIn={optIn}
                  onTeamChange={handleTeamChange}
                />
              </CardBody>
            </Card>
          ) : null}

          {/* SEEDED_LEADERBOARD: game slots (T-061) */}
          {stage.mechanism === 'SEEDED_LEADERBOARD' && games.length > 0 ? (
            <Stack gap="sm">
              <Heading level={2}>Games</Heading>
              <Stack gap="xs">
                {games.map((game) => {
                  const existingResult = myResults.get(game.id) ?? null;
                  const canSubmit = token && myTeamId != null;
                  return (
                    <Card key={game.id} variant="outline">
                      <CardHeader>
                        <Inline gap="xs" justify="space-between" wrap>
                          <Text variant="body">
                            Game {game.game_index + 1}
                            {game.seed_payload ? ` — Seed: ${game.seed_payload}` : ''}
                            {game.max_score != null ? ` (max ${game.max_score})` : ''}
                          </Text>
                          {game.team_size != null ? (
                            <Badge size="sm">{game.team_size}-player</Badge>
                          ) : null}
                        </Inline>
                      </CardHeader>
                      <CardBody>
                        {canSubmit ? (
                          <ResultForm
                            game={{ ...game, stage_id: stageId }}
                            teamId={myTeamId}
                            slug={slug!}
                            token={token}
                            existingResult={existingResult}
                            onSuccess={(r) => handleResultSuccess(game.id, r)}
                          />
                        ) : existingResult ? (
                          <Inline gap="sm" wrap>
                            <Text variant="body">
                              Score: <strong>{existingResult.score}</strong>
                            </Text>
                            {existingResult.bottom_deck_risk != null ? (
                              <Text variant="caption">BDR: {existingResult.bottom_deck_risk}</Text>
                            ) : null}
                          </Inline>
                        ) : (
                          <Text variant="muted">
                            {token ? 'No team assigned yet.' : 'Log in to submit a result.'}
                          </Text>
                        )}
                      </CardBody>
                    </Card>
                  );
                })}
              </Stack>
            </Stack>
          ) : null}

          {/* GAUNTLET section (T-063) */}
          {stage.mechanism === 'GAUNTLET' && token ? (
            <GauntletSection
              slug={slug!}
              stageId={stageId}
              token={token}
              games={games}
              myTeamId={myTeamId}
              version={authVersion}
              onVersionChange={handleTeamChange}
            />
          ) : null}

          {/* MATCH_PLAY bracket rounds (T-064) — standings moved to unified leaderboard section */}
          {stage.mechanism === 'MATCH_PLAY' && currentStageMatchPlay ? (
            <MatchPlaySection standings={currentStageMatchPlay} userId={user?.id} hideStandings />
          ) : null}

          {/* Unified leaderboard section */}
          {lbFetched ? (
            <Stack gap="sm">
              <Heading level={2}>Leaderboard</Heading>

              {/* Stage tabs */}
              {showStageTabs ? (
                <Tabs
                  items={allStages.map((s) => ({
                    key: String(s.id),
                    label: s.label,
                    active: effectiveLbStageId === s.id,
                    onSelect: () => {
                      setActiveLbStageId(s.id);
                      setActiveLbSize(null);
                    },
                  }))}
                />
              ) : null}

              {/* Player count tabs */}
              {showSizeTabs ? (
                <Tabs
                  items={sizeCandidates.map((sz) => ({
                    key: String(sz),
                    label: `${sz}-player`,
                    active: (effectiveLbSize ?? sizeCandidates[0]) === sz,
                    onSelect: () => setActiveLbSize(sz),
                  }))}
                />
              ) : null}

              {/* SEEDED_LEADERBOARD table */}
              {seededLb && filteredSeededEntries.length > 0
                ? (() => {
                    const lbGameIndices =
                      effectiveLbStageId === stageId
                        ? gameIndices
                        : [
                            ...new Set(
                              filteredSeededEntries.flatMap((e) =>
                                e.game_scores.map((gs) => gs.game_index),
                              ),
                            ),
                          ].sort((a, b) => a - b);
                    const rows = isIndividualLbStage
                      ? toIndividualRows(filteredSeededEntries)
                      : null;
                    return (
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>{isIndividualLbStage ? 'Player' : 'Team'}</Table.Th>
                            {lbGameIndices.map((gi) => (
                              <Table.Th key={gi} style={{ textAlign: 'right' }}>
                                G{gi + 1}
                              </Table.Th>
                            ))}
                            <Table.Th style={{ textAlign: 'right' }}>Total</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {rows
                            ? rows.map((row, idx) => (
                                <Table.Tr key={idx} style={row.isMe ? { fontWeight: 'bold' } : {}}>
                                  <Table.Td>{row.rank}</Table.Td>
                                  <Table.Td>{row.name}</Table.Td>
                                  {lbGameIndices.map((gi) => {
                                    const gs = row.game_scores.find((g) => g.game_index === gi);
                                    return (
                                      <Table.Td key={gi} style={{ textAlign: 'right' }}>
                                        {gs != null ? gs.score : '—'}
                                      </Table.Td>
                                    );
                                  })}
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {row.stage_score}
                                  </Table.Td>
                                </Table.Tr>
                              ))
                            : filteredSeededEntries.map((entry) => {
                                const isMe = entry.team.members.some((m) => m.user_id === user?.id);
                                return (
                                  <Table.Tr
                                    key={entry.team.id}
                                    style={isMe ? { fontWeight: 'bold' } : {}}
                                  >
                                    <Table.Td>{entry.rank}</Table.Td>
                                    <Table.Td>{entry.team.display_name}</Table.Td>
                                    {lbGameIndices.map((gi) => {
                                      const gs = entry.game_scores.find((g) => g.game_index === gi);
                                      return (
                                        <Table.Td key={gi} style={{ textAlign: 'right' }}>
                                          {gs != null ? gs.score : '—'}
                                        </Table.Td>
                                      );
                                    })}
                                    <Table.Td style={{ textAlign: 'right' }}>
                                      {entry.stage_score}
                                    </Table.Td>
                                  </Table.Tr>
                                );
                              })}
                        </Table.Tbody>
                      </Table>
                    );
                  })()
                : null}

              {/* GAUNTLET table */}
              {gauntletLb && filteredGauntletEntries.length > 0
                ? (() => {
                    const lbGameIndices =
                      effectiveLbStageId === stageId
                        ? gameIndices
                        : [
                            ...new Set(
                              filteredGauntletEntries.flatMap((e) =>
                                e.game_scores.map((gs) => gs.game_index),
                              ),
                            ),
                          ].sort((a, b) => a - b);
                    const rows = isIndividualLbStage
                      ? toGauntletIndividualRows(filteredGauntletEntries)
                      : null;
                    return (
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>#</Table.Th>
                            <Table.Th>{isIndividualLbStage ? 'Player' : 'Team'}</Table.Th>
                            {lbGameIndices.map((gi) => (
                              <Table.Th key={gi} style={{ textAlign: 'right' }}>
                                G{gi + 1}
                              </Table.Th>
                            ))}
                            <Table.Th style={{ textAlign: 'right' }}>Best</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {rows
                            ? rows.map((row, idx) => (
                                <Table.Tr key={idx} style={row.isMe ? { fontWeight: 'bold' } : {}}>
                                  <Table.Td>{row.rank ?? '—'}</Table.Td>
                                  <Table.Td>
                                    {row.name}
                                    {row.dnf ? ' (DNF)' : ''}
                                  </Table.Td>
                                  {lbGameIndices.map((gi) => {
                                    const gs = row.game_scores.find((g) => g.game_index === gi);
                                    return (
                                      <Table.Td key={gi} style={{ textAlign: 'right' }}>
                                        {gs != null ? gs.score : '—'}
                                      </Table.Td>
                                    );
                                  })}
                                  <Table.Td style={{ textAlign: 'right' }}>
                                    {row.stage_score ?? '—'}
                                  </Table.Td>
                                </Table.Tr>
                              ))
                            : filteredGauntletEntries.map((entry, idx) => {
                                const isMe = entry.team.members.some((m) => m.user_id === user?.id);
                                return (
                                  <Table.Tr
                                    key={entry.team.id ?? idx}
                                    style={isMe ? { fontWeight: 'bold' } : {}}
                                  >
                                    <Table.Td>{entry.rank ?? '—'}</Table.Td>
                                    <Table.Td>
                                      {entry.team.display_name}
                                      {entry.dnf ? ' (DNF)' : ''}
                                    </Table.Td>
                                    {lbGameIndices.map((gi) => {
                                      const gs = entry.game_scores.find((g) => g.game_index === gi);
                                      return (
                                        <Table.Td key={gi} style={{ textAlign: 'right' }}>
                                          {gs != null ? gs.score : '—'}
                                        </Table.Td>
                                      );
                                    })}
                                    <Table.Td style={{ textAlign: 'right' }}>
                                      {entry.stage_score ?? '—'}
                                    </Table.Td>
                                  </Table.Tr>
                                );
                              })}
                        </Table.Tbody>
                      </Table>
                    );
                  })()
                : null}

              {/* MATCH_PLAY standings */}
              {matchPlayStandings && matchPlayStandings.entries.length > 0 ? (
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>{isIndividualLbStage ? 'Player' : 'Team'}</Table.Th>
                      <Table.Th>Status</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {matchPlayStandings.entries.flatMap((entry, idx) => {
                      const rows = isIndividualLbStage
                        ? entry.team.members.map((m) => ({
                            name: m.display_name,
                            isMe: m.user_id === user?.id,
                          }))
                        : [
                            {
                              name: entry.team.display_name,
                              isMe: entry.team.members.some((m) => m.user_id === user?.id),
                            },
                          ];
                      return rows.map((row, rowIdx) => (
                        <Table.Tr
                          key={`${idx}-${rowIdx}`}
                          style={row.isMe ? { fontWeight: 'bold' } : {}}
                        >
                          <Table.Td>{row.name}</Table.Td>
                          <Table.Td>
                            {entry.status === 'champion'
                              ? 'Champion'
                              : entry.status === 'active'
                                ? 'Active'
                                : `Eliminated (${entry.placement != null ? `#${entry.placement}` : '—'})`}
                          </Table.Td>
                        </Table.Tr>
                      ));
                    })}
                  </Table.Tbody>
                </Table>
              ) : null}

              {/* Empty / error state */}
              {!hasLbEntries ? (
                activeLb === null ? (
                  <Text variant="muted">Leaderboard unavailable.</Text>
                ) : (
                  <Text variant="muted">No results submitted yet.</Text>
                )
              ) : null}
            </Stack>
          ) : null}
        </Section>
      </PageContainer>
    </Main>
  );
}
