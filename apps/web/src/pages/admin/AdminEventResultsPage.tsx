import { useEffect, useState } from 'react';
import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreSelect,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  SectionCard,
} from '../../design-system';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStages } from '../../hooks/useStages';
import {
  ApiError,
  deleteJsonAuth,
  getJsonAuth,
  patchJsonAuth,
  postJsonAuth,
  putJsonAuth,
} from '../../lib/api';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type TeamMember = {
  user_id: number;
  display_name: string;
  confirmed: boolean;
};

// ---------------------------------------------------------------------------
// Game-slot results types (T-053)
// ---------------------------------------------------------------------------

type GameSlot = {
  id: number;
  game_index: number;
  team_size: number | null;
  variant_id: number | null;
  seed_payload: string | null;
  max_score: number | null;
};

type TeamRow = {
  id: number;
  stage_id: number | null;
  team_size: number;
  display_name: string;
  members: TeamMember[];
};

type ResultEntry = {
  id: number;
  event_team_id: number;
  score: number;
  zero_reason: string | null;
  bottom_deck_risk: number | null;
  strikes: number | null;
  clues_remaining: number | null;
  hanabi_live_game_id: number | null;
  participants: Array<{ user_id: number; display_name: string }>;
};

type EditFormState = {
  zero_reason: string;
  hanabi_live_game_id: string;
};

type EditKey = string;

const ZERO_REASONS = [
  { value: 'Strike Out', label: 'Strike Out' },
  { value: 'Time Out', label: 'Time Out' },
  { value: 'VTK', label: 'VTK' },
];

// ---------------------------------------------------------------------------
// Match results types (T-054)
// ---------------------------------------------------------------------------

type MatchGameResult = {
  id: number;
  match_id: number;
  game_index: number;
  variant_id: number | null;
  seed_payload: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';

type MatchRow = {
  id: number;
  stage_id: number;
  round_number: number;
  team1_id: number;
  team2_id: number;
  status: MatchStatus;
  winner_team_id: number | null;
  team1_display_name: string;
  team2_display_name: string;
  game_results: MatchGameResult[];
};

// ---------------------------------------------------------------------------
// ResultRowEntry component (game-slot mode)
// ---------------------------------------------------------------------------

type ResultRowProps = {
  gameSlot: GameSlot;
  team: TeamRow;
  result: ResultEntry | null;
  editKey: EditKey;
  activeEditKey: EditKey | null;
  editForm: EditFormState;
  editBusy: boolean;
  editError: string | null;
  onStartEdit: (key: EditKey, form: EditFormState) => void;
  onFormChange: (form: EditFormState) => void;
  onSave: (gameSlot: GameSlot, team: TeamRow, result: ResultEntry | null) => void;
  onCancel: () => void;
  onDelete: (resultId: number) => void;
  deleteBusy: number | null;
};

function ResultRowEntry({
  gameSlot,
  team,
  result,
  editKey,
  activeEditKey,
  editForm,
  editBusy,
  editError,
  onStartEdit,
  onFormChange,
  onSave,
  onCancel,
  onDelete,
  deleteBusy,
}: ResultRowProps) {
  const isEditing = activeEditKey === editKey;

  return (
    <Group justify="space-between" align="flex-start" gap="xs">
      <Stack gap={2} style={{ flex: 1 }}>
        <Group gap="xs">
          <Text size="sm" fw={500}>
            {team.display_name}
          </Text>
          {team.members.map((m) => (
            <Badge
              key={m.user_id}
              variant={m.confirmed ? 'light' : 'outline'}
              color={m.confirmed ? 'blue' : 'gray'}
              size="xs"
            >
              {m.display_name}
            </Badge>
          ))}
        </Group>

        {!isEditing && result ? (
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {result.score}
            </Text>
            {result.zero_reason ? (
              <Badge size="xs" color="red" variant="light">
                {result.zero_reason}
              </Badge>
            ) : null}
            {result.hanabi_live_game_id !== null ? (
              <Text size="xs" c="dimmed">
                HL #{result.hanabi_live_game_id}
              </Text>
            ) : null}
            {result.bottom_deck_risk !== null ? (
              <Text size="xs" c="dimmed">
                BDR: {result.bottom_deck_risk}
              </Text>
            ) : null}
            {result.strikes !== null ? (
              <Text size="xs" c="dimmed">
                Strikes: {result.strikes}
              </Text>
            ) : null}
            {result.clues_remaining !== null ? (
              <Text size="xs" c="dimmed">
                Clues: {result.clues_remaining}
              </Text>
            ) : null}
          </Group>
        ) : null}

        {!isEditing && !result ? (
          <Text size="xs" c="dimmed">
            No result yet
          </Text>
        ) : null}

        {isEditing ? (
          <Stack gap="xs">
            {editError ? (
              <Alert color="red" variant="light">
                {editError}
              </Alert>
            ) : null}
            <Group gap="xs" align="flex-end">
              <div style={{ width: 110 }}>
                <TextInput
                  label="HL Game ID"
                  size="xs"
                  value={editForm.hanabi_live_game_id}
                  onChange={(e) =>
                    onFormChange({
                      ...editForm,
                      hanabi_live_game_id: e.currentTarget.value.replace(/\D/g, ''),
                    })
                  }
                  placeholder="—"
                />
              </div>
              {result?.score === 0 ? (
                <div style={{ width: 140 }}>
                  <CoreSelect
                    label="Zero reason"
                    size="xs"
                    value={editForm.zero_reason}
                    onChange={(v) => onFormChange({ ...editForm, zero_reason: v ?? '' })}
                    data={ZERO_REASONS}
                    placeholder="Select reason"
                  />
                </div>
              ) : null}
            </Group>
            <Group gap="xs">
              <Button size="xs" loading={editBusy} onClick={() => onSave(gameSlot, team, result)}>
                Save
              </Button>
              <Button size="xs" variant="default" onClick={onCancel}>
                Cancel
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Stack>

      {!isEditing ? (
        <Group gap={4}>
          <Button
            size="xs"
            variant={result ? 'default' : 'light'}
            color={result ? undefined : 'blue'}
            disabled={activeEditKey !== null}
            onClick={() =>
              onStartEdit(editKey, {
                zero_reason: result?.zero_reason ?? '',
                hanabi_live_game_id:
                  result?.hanabi_live_game_id !== null
                    ? String(result?.hanabi_live_game_id ?? '')
                    : '',
              })
            }
          >
            {result ? 'Edit' : 'Enter'}
          </Button>
          {result ? (
            <Button
              size="xs"
              variant="outline"
              color="red"
              disabled={activeEditKey !== null || deleteBusy !== null}
              loading={deleteBusy === result.id}
              onClick={() => onDelete(result.id)}
            >
              Del
            </Button>
          ) : null}
        </Group>
      ) : null}
    </Group>
  );
}

// ---------------------------------------------------------------------------
// MatchResultsSection (T-054)
// ---------------------------------------------------------------------------

type MatchResultsSectionProps = {
  slug: string;
  stageId: string;
  token: string;
};

function MatchResultsSection({ slug, stageId, token }: MatchResultsSectionProps) {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Per-match game editing: { matchId, gameIndex (null = new) }
  const [editingGame, setEditingGame] = useState<{
    matchId: number;
    gameIndex: number | null;
  } | null>(null);
  const [gameForm, setGameForm] = useState({ game_index: '', t1: '', t2: '' });
  const [gameBusy, setGameBusy] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);

  // Status / winner actions
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Bracket advance
  const [advanceBusy, setAdvanceBusy] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        // Fetch match list then fetch details for each in parallel
        const list = await getJsonAuth<MatchRow[]>(
          `/events/${encodeURIComponent(slug)}/stages/${stageId}/matches`,
          token,
        );
        const details = await Promise.all(
          list.map((m) =>
            getJsonAuth<MatchRow>(
              `/events/${encodeURIComponent(slug)}/stages/${stageId}/matches/${m.id}`,
              token,
            ),
          ),
        );
        if (!cancelled) {
          setMatches(details);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load matches.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, version]);

  async function handleSaveGameResult() {
    if (!editingGame) return;
    setGameBusy(true);
    setGameError(null);

    const gameIndex =
      editingGame.gameIndex !== null ? editingGame.gameIndex : Number(gameForm.game_index);
    const t1 = Number(gameForm.t1);
    const t2 = Number(gameForm.t2);

    if (editingGame.gameIndex === null) {
      if (!Number.isInteger(gameIndex) || gameIndex <= 0) {
        setGameError('Game index must be a positive integer.');
        setGameBusy(false);
        return;
      }
    }
    if (isNaN(t1) || t1 < 0 || !Number.isInteger(t1)) {
      setGameError('Team 1 score must be a non-negative integer.');
      setGameBusy(false);
      return;
    }
    if (isNaN(t2) || t2 < 0 || !Number.isInteger(t2)) {
      setGameError('Team 2 score must be a non-negative integer.');
      setGameBusy(false);
      return;
    }

    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/matches/${editingGame.matchId}/results`,
        token,
        { game_index: gameIndex, team1_score: t1, team2_score: t2 },
      );
      setEditingGame(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setGameError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Save failed.')
          : 'Save failed.',
      );
    } finally {
      setGameBusy(false);
    }
  }

  async function handleMarkComplete(matchId: number) {
    setActionBusy(matchId);
    setActionError(null);
    try {
      await putJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/matches/${matchId}/status`,
        token,
        { status: 'COMPLETE' },
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to mark complete.')
          : 'Failed to mark complete.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleSetWinner(matchId: number, winnerTeamId: number | null) {
    setActionBusy(matchId);
    setActionError(null);
    try {
      await patchJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/matches/${matchId}/winner`,
        token,
        { winner_team_id: winnerTeamId },
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to set winner.')
          : 'Failed to set winner.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleAdvance() {
    setAdvanceBusy(true);
    setAdvanceError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/bracket/advance`,
        token,
        {},
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setAdvanceError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Advance failed.')
          : 'Advance failed.',
      );
    } finally {
      setAdvanceBusy(false);
    }
  }

  if (loading) {
    return (
      <Text c="dimmed" size="sm">
        Loading matches…
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

  if (matches.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No matches yet. Draw the bracket first.
      </Text>
    );
  }

  // Group by round
  const roundMap = new Map<number, MatchRow[]>();
  for (const m of matches) {
    if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
    roundMap.get(m.round_number)!.push(m);
  }
  const rounds = [...roundMap.keys()].sort((a, b) => a - b);
  const currentRound = Math.max(...rounds);
  const currentRoundMatches = roundMap.get(currentRound) ?? [];
  const allCurrentComplete = currentRoundMatches.every((m) => m.status === 'COMPLETE');

  function statusColor(s: MatchStatus): string {
    switch (s) {
      case 'COMPLETE':
        return 'green';
      case 'IN_PROGRESS':
        return 'blue';
      default:
        return 'gray';
    }
  }

  return (
    <Stack gap="md">
      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

      {rounds.map((round) => {
        const roundMatches = roundMap.get(round)!;
        const completeCount = roundMatches.filter((m) => m.status === 'COMPLETE').length;

        return (
          <Stack key={round} gap="xs">
            <Group gap="xs">
              <Text fw={600} size="sm">
                Round {round}
              </Text>
              <Badge
                size="xs"
                variant="outline"
                color={completeCount === roundMatches.length ? 'green' : 'yellow'}
              >
                {completeCount}/{roundMatches.length} complete
              </Badge>
            </Group>

            {roundMatches.map((match) => {
              const isEditingThisNew =
                editingGame?.matchId === match.id && editingGame.gameIndex === null;
              const winnerOptions = [
                { value: '', label: '— TBD —' },
                { value: String(match.team1_id), label: match.team1_display_name },
                { value: String(match.team2_id), label: match.team2_display_name },
              ];

              return (
                <SectionCard key={match.id}>
                  <Stack gap="sm">
                    {/* Match header */}
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Text size="sm" fw={600}>
                            {match.team1_display_name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            vs
                          </Text>
                          <Text size="sm" fw={600}>
                            {match.team2_display_name}
                          </Text>
                          <Badge size="xs" color={statusColor(match.status)} variant="light">
                            {match.status}
                          </Badge>
                        </Group>
                        {match.winner_team_id !== null ? (
                          <Group gap="xs">
                            <Text size="xs" c="dimmed">
                              Winner:
                            </Text>
                            <Badge size="xs" color="green" variant="light">
                              {match.winner_team_id === match.team1_id
                                ? match.team1_display_name
                                : match.team2_display_name}
                            </Badge>
                          </Group>
                        ) : null}
                      </Stack>

                      <Group gap="xs">
                        {match.status !== 'COMPLETE' ? (
                          <Button
                            size="xs"
                            variant="light"
                            color="green"
                            loading={actionBusy === match.id}
                            disabled={actionBusy !== null && actionBusy !== match.id}
                            onClick={() => void handleMarkComplete(match.id)}
                          >
                            Mark Complete
                          </Button>
                        ) : null}
                      </Group>
                    </Group>

                    {/* Game results table */}
                    {match.game_results.length > 0 ? (
                      <Stack gap={4}>
                        <Group
                          gap={0}
                          style={{
                            borderBottom: '1px solid var(--mantine-color-gray-3)',
                            paddingBottom: 4,
                          }}
                        >
                          <Text size="xs" fw={600} style={{ width: 70 }}>
                            Game #
                          </Text>
                          <Text size="xs" fw={600} style={{ flex: 1 }}>
                            {match.team1_display_name}
                          </Text>
                          <Text size="xs" fw={600} style={{ flex: 1 }}>
                            {match.team2_display_name}
                          </Text>
                          <div style={{ width: 60 }} />
                        </Group>

                        {match.game_results.map((gr) => {
                          const isEditingThis =
                            editingGame?.matchId === match.id &&
                            editingGame.gameIndex === gr.game_index;

                          return (
                            <Group key={gr.game_index} gap={0} align="center">
                              <Text size="sm" style={{ width: 70 }}>
                                {gr.game_index}
                              </Text>

                              {isEditingThis ? (
                                <>
                                  <div style={{ flex: 1, paddingRight: 8 }}>
                                    <TextInput
                                      size="xs"
                                      value={gameForm.t1}
                                      onChange={(e) =>
                                        setGameForm((f) => ({
                                          ...f,
                                          t1: e.currentTarget.value.replace(/\D/g, ''),
                                        }))
                                      }
                                    />
                                  </div>
                                  <div style={{ flex: 1, paddingRight: 8 }}>
                                    <TextInput
                                      size="xs"
                                      value={gameForm.t2}
                                      onChange={(e) =>
                                        setGameForm((f) => ({
                                          ...f,
                                          t2: e.currentTarget.value.replace(/\D/g, ''),
                                        }))
                                      }
                                    />
                                  </div>
                                  <Group gap={4} style={{ width: 60 }}>
                                    <Button
                                      size="xs"
                                      loading={gameBusy}
                                      onClick={() => void handleSaveGameResult()}
                                    >
                                      Save
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="default"
                                      onClick={() => {
                                        setEditingGame(null);
                                        setGameError(null);
                                      }}
                                    >
                                      ✕
                                    </Button>
                                  </Group>
                                </>
                              ) : (
                                <>
                                  <Text size="sm" style={{ flex: 1 }}>
                                    {gr.team1_score ?? '—'}
                                  </Text>
                                  <Text size="sm" style={{ flex: 1 }}>
                                    {gr.team2_score ?? '—'}
                                  </Text>
                                  <Group gap={4} style={{ width: 60 }}>
                                    <Button
                                      size="xs"
                                      variant="default"
                                      disabled={editingGame !== null}
                                      onClick={() => {
                                        setEditingGame({
                                          matchId: match.id,
                                          gameIndex: gr.game_index,
                                        });
                                        setGameForm({
                                          game_index: String(gr.game_index),
                                          t1: gr.team1_score !== null ? String(gr.team1_score) : '',
                                          t2: gr.team2_score !== null ? String(gr.team2_score) : '',
                                        });
                                        setGameError(null);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                  </Group>
                                </>
                              )}
                            </Group>
                          );
                        })}

                        {/* Totals row */}
                        <Group
                          gap={0}
                          style={{
                            borderTop: '1px solid var(--mantine-color-gray-3)',
                            paddingTop: 4,
                          }}
                        >
                          <Text size="xs" fw={600} style={{ width: 70 }}>
                            Total
                          </Text>
                          <Text size="sm" fw={600} style={{ flex: 1 }}>
                            {match.game_results.reduce((s, g) => s + (g.team1_score ?? 0), 0)}
                          </Text>
                          <Text size="sm" fw={600} style={{ flex: 1 }}>
                            {match.game_results.reduce((s, g) => s + (g.team2_score ?? 0), 0)}
                          </Text>
                          <div style={{ width: 60 }} />
                        </Group>
                      </Stack>
                    ) : null}

                    {/* Error display for game editing */}
                    {gameError && editingGame?.matchId === match.id ? (
                      <Alert color="red" variant="light">
                        {gameError}
                      </Alert>
                    ) : null}

                    {/* Add game result */}
                    {!isEditingThisNew ? (
                      <Button
                        size="xs"
                        variant="subtle"
                        disabled={editingGame !== null}
                        onClick={() => {
                          setEditingGame({ matchId: match.id, gameIndex: null });
                          setGameForm({ game_index: '', t1: '', t2: '' });
                          setGameError(null);
                        }}
                      >
                        + Add game result
                      </Button>
                    ) : (
                      <Stack gap="xs">
                        <Group gap="xs" align="flex-end">
                          <div style={{ width: 80 }}>
                            <TextInput
                              label="Game #"
                              size="xs"
                              value={gameForm.game_index}
                              onChange={(e) =>
                                setGameForm((f) => ({
                                  ...f,
                                  game_index: e.currentTarget.value.replace(/\D/g, ''),
                                }))
                              }
                              placeholder="1"
                            />
                          </div>
                          <div style={{ width: 100 }}>
                            <TextInput
                              label={match.team1_display_name}
                              size="xs"
                              value={gameForm.t1}
                              onChange={(e) =>
                                setGameForm((f) => ({
                                  ...f,
                                  t1: e.currentTarget.value.replace(/\D/g, ''),
                                }))
                              }
                              placeholder="score"
                            />
                          </div>
                          <div style={{ width: 100 }}>
                            <TextInput
                              label={match.team2_display_name}
                              size="xs"
                              value={gameForm.t2}
                              onChange={(e) =>
                                setGameForm((f) => ({
                                  ...f,
                                  t2: e.currentTarget.value.replace(/\D/g, ''),
                                }))
                              }
                              placeholder="score"
                            />
                          </div>
                        </Group>
                        <Group gap="xs">
                          <Button
                            size="xs"
                            loading={gameBusy}
                            onClick={() => void handleSaveGameResult()}
                          >
                            Save
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => {
                              setEditingGame(null);
                              setGameError(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </Group>
                      </Stack>
                    )}

                    {/* Winner override */}
                    <Group gap="xs" align="center">
                      <Text size="xs" c="dimmed">
                        Winner override:
                      </Text>
                      <div style={{ width: 180 }}>
                        <CoreSelect
                          size="xs"
                          value={match.winner_team_id !== null ? String(match.winner_team_id) : ''}
                          onChange={(v) => void handleSetWinner(match.id, v ? Number(v) : null)}
                          data={winnerOptions}
                          disabled={actionBusy !== null}
                        />
                      </div>
                    </Group>
                  </Stack>
                </SectionCard>
              );
            })}
          </Stack>
        );
      })}

      {/* Advance bracket */}
      {advanceError ? (
        <Alert color="red" variant="light">
          {advanceError}
        </Alert>
      ) : null}

      {allCurrentComplete ? (
        <Group>
          <Button
            size="sm"
            color="green"
            loading={advanceBusy}
            onClick={() => void handleAdvance()}
          >
            Advance to Round {currentRound + 1}
          </Button>
        </Group>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminEventResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token } = useAuth();

  const { stages, loading: stagesLoading, error: stagesError } = useStages(slug);

  const [selectedStageId, setSelectedStageId] = useState<string>('');
  const [gameSlots, setGameSlots] = useState<GameSlot[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [resultsByGame, setResultsByGame] = useState<Map<number, ResultEntry[]>>(new Map());
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Edit state (game-slot mode)
  const [activeEditKey, setActiveEditKey] = useState<EditKey | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>({
    zero_reason: '',
    hanabi_live_game_id: '',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const stage = stages.find((s) => String(s.id) === selectedStageId);
  const isMatchPlay = stage?.mechanism === 'MATCH_PLAY';

  // Load data when stage changes (game-slot mode only)
  useEffect(() => {
    if (!slug || !token || !selectedStageId || isMatchPlay) {
      setGameSlots([]);
      setTeams([]);
      setResultsByGame(new Map());
      return;
    }
    let cancelled = false;

    async function load() {
      setDataLoading(true);
      setDataError(null);
      try {
        const [slotsData, teamsData] = await Promise.all([
          getJsonAuth<GameSlot[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${selectedStageId}/games`,
            token as string,
          ),
          getJsonAuth<TeamRow[]>(`/events/${encodeURIComponent(slug!)}/teams`, token as string),
        ]);

        if (cancelled) return;

        setGameSlots(slotsData);
        setTeams(teamsData);

        const resultsMap = new Map<number, ResultEntry[]>();
        if (slotsData.length > 0) {
          const resultFetches = slotsData.map((slot) =>
            getJsonAuth<ResultEntry[]>(
              `/events/${encodeURIComponent(slug!)}/stages/${selectedStageId}/games/${slot.id}/results`,
              token as string,
            ).then((res) => ({ slotId: slot.id, results: res })),
          );
          const allResults = await Promise.all(resultFetches);
          if (!cancelled) {
            for (const { slotId, results } of allResults) {
              resultsMap.set(slotId, results);
            }
          }
        }

        if (!cancelled) {
          setResultsByGame(resultsMap);
          setDataLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDataError('Failed to load results data.');
          setDataLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, token, selectedStageId, isMatchPlay, version]);

  // Auto-select first stage
  useEffect(() => {
    if (!selectedStageId && stages.length > 0) {
      setSelectedStageId(String(stages[0].id));
    }
  }, [stages, selectedStageId]);

  function teamsForSlot(slot: GameSlot): TeamRow[] {
    if (!stage) return [];
    const stageTeams =
      stage.team_scope === 'STAGE' || stage.participation_type === 'INDIVIDUAL'
        ? teams.filter((t) => t.stage_id === Number(selectedStageId))
        : teams.filter((t) => t.stage_id === null);
    if (slot.team_size !== null) {
      return stageTeams.filter((t) => t.team_size === slot.team_size);
    }
    return stageTeams;
  }

  function resultForTeam(gameId: number, teamId: number): ResultEntry | null {
    const results = resultsByGame.get(gameId) ?? [];
    return results.find((r) => r.event_team_id === teamId) ?? null;
  }

  async function handleSave(gameSlot: GameSlot, team: TeamRow, existing: ResultEntry | null) {
    if (!slug || !token) return;
    setEditBusy(true);
    setEditError(null);

    const body: Record<string, unknown> = {
      hanabi_live_game_id: editForm.hanabi_live_game_id
        ? Number(editForm.hanabi_live_game_id)
        : null,
    };

    // zero_reason is only editable when the existing result has score = 0
    if (existing?.score === 0) {
      body.zero_reason = editForm.zero_reason || null;
    }

    try {
      if (existing) {
        await putJsonAuth(
          `/events/${encodeURIComponent(slug)}/results/${existing.id}`,
          token,
          body,
        );
      } else {
        await postJsonAuth(
          `/events/${encodeURIComponent(slug)}/stages/${selectedStageId}/games/${gameSlot.id}/results`,
          token,
          { ...body, team_id: team.id },
        );
      }
      setActiveEditKey(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setEditError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Save failed.')
          : 'Save failed.',
      );
    } finally {
      setEditBusy(false);
    }
  }

  async function handleDelete(resultId: number) {
    if (!slug || !token) return;
    if (!confirm('Delete this result? This cannot be undone.')) return;
    setDeleteBusy(resultId);
    setDeleteError(null);
    try {
      await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/results/${resultId}`, token);
      setVersion((v) => v + 1);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Delete failed.')
          : 'Delete failed.',
      );
    } finally {
      setDeleteBusy(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (stagesLoading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (stagesError) {
    return (
      <Alert color="red" variant="light">
        {stagesError}
      </Alert>
    );
  }

  if (stages.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        No stages yet.
      </Text>
    );
  }

  const stageOptions = stages.map((s) => ({ value: String(s.id), label: s.label }));

  const slotsByIndex = new Map<number, GameSlot[]>();
  for (const slot of gameSlots) {
    if (!slotsByIndex.has(slot.game_index)) slotsByIndex.set(slot.game_index, []);
    slotsByIndex.get(slot.game_index)!.push(slot);
  }
  const sortedGameIndexes = [...slotsByIndex.keys()].sort((a, b) => a - b);

  return (
    <Stack gap="md">
      <Group gap="md" align="flex-end">
        <div style={{ width: 240 }}>
          <CoreSelect
            label="Stage"
            value={selectedStageId}
            onChange={(v) => {
              setSelectedStageId(v ?? '');
              setActiveEditKey(null);
            }}
            data={stageOptions}
          />
        </div>
        {stage ? (
          <Text size="xs" c="dimmed">
            {stage.mechanism} · {stage.team_scope} scope
          </Text>
        ) : null}
      </Group>

      {isMatchPlay && slug && token ? (
        <MatchResultsSection slug={slug} stageId={selectedStageId} token={token} />
      ) : dataLoading ? (
        <Text c="dimmed" size="sm">
          Loading…
        </Text>
      ) : dataError ? (
        <Alert color="red" variant="light">
          {dataError}
        </Alert>
      ) : gameSlots.length === 0 ? (
        <Text c="dimmed" size="sm">
          No game slots for this stage.
        </Text>
      ) : (
        <>
          {deleteError ? (
            <Alert color="red" variant="light">
              {deleteError}
            </Alert>
          ) : null}

          {sortedGameIndexes.map((gameIndex) => {
            const slots = slotsByIndex.get(gameIndex)!;
            const hasPerTrack = slots.length > 1 || slots[0].team_size !== null;

            return (
              <SectionCard key={gameIndex}>
                <Stack gap="sm">
                  <Text fw={600} size="sm">
                    Game {gameIndex}
                  </Text>

                  {slots.map((slot) => {
                    const slotTeams = teamsForSlot(slot);
                    const slotResults = resultsByGame.get(slot.id) ?? [];
                    const submittedCount = slotTeams.filter(
                      (t) => resultForTeam(slot.id, t.id) !== null,
                    ).length;

                    return (
                      <Stack key={slot.id} gap="xs">
                        {hasPerTrack && slot.team_size !== null ? (
                          <Group gap="xs">
                            <Badge size="xs" variant="light" color="gray">
                              {slot.team_size}p
                            </Badge>
                            {slot.variant_id !== null ? (
                              <Text size="xs" c="dimmed">
                                Variant {slot.variant_id}
                              </Text>
                            ) : null}
                            {slot.max_score !== null ? (
                              <Text size="xs" c="dimmed">
                                Max: {slot.max_score}
                              </Text>
                            ) : null}
                            <Badge
                              size="xs"
                              variant="outline"
                              color={submittedCount === slotTeams.length ? 'green' : 'yellow'}
                            >
                              {submittedCount}/{slotTeams.length} submitted
                            </Badge>
                          </Group>
                        ) : (
                          <Group gap="xs">
                            {slot.variant_id !== null ? (
                              <Text size="xs" c="dimmed">
                                Variant {slot.variant_id}
                              </Text>
                            ) : null}
                            {slot.max_score !== null ? (
                              <Text size="xs" c="dimmed">
                                Max: {slot.max_score}
                              </Text>
                            ) : null}
                            <Badge
                              size="xs"
                              variant="outline"
                              color={
                                submittedCount === slotTeams.length && slotTeams.length > 0
                                  ? 'green'
                                  : 'yellow'
                              }
                            >
                              {submittedCount}/{slotTeams.length} submitted
                            </Badge>
                          </Group>
                        )}

                        {slotTeams.length === 0 ? (
                          <Text size="xs" c="dimmed">
                            No eligible teams.
                          </Text>
                        ) : (
                          <Stack gap="xs">
                            {slotTeams.map((team) => {
                              const result = resultForTeam(slot.id, team.id);
                              const editKey: EditKey = `${slot.id}-${team.id}`;
                              return (
                                <ResultRowEntry
                                  key={team.id}
                                  gameSlot={slot}
                                  team={team}
                                  result={result}
                                  editKey={editKey}
                                  activeEditKey={activeEditKey}
                                  editForm={editForm}
                                  editBusy={editBusy}
                                  editError={editError}
                                  onStartEdit={(key, form) => {
                                    setActiveEditKey(key);
                                    setEditForm(form);
                                    setEditError(null);
                                  }}
                                  onFormChange={setEditForm}
                                  onSave={handleSave}
                                  onCancel={() => {
                                    setActiveEditKey(null);
                                    setEditError(null);
                                  }}
                                  onDelete={handleDelete}
                                  deleteBusy={deleteBusy}
                                />
                              );
                            })}
                          </Stack>
                        )}

                        {slotResults
                          .filter((r) => !slotTeams.some((t) => t.id === r.event_team_id))
                          .map((r) => (
                            <Group key={r.id} justify="space-between" gap="xs">
                              <Stack gap={2}>
                                <Text size="xs" c="dimmed">
                                  Team #{r.event_team_id}
                                </Text>
                                <Group gap="xs">
                                  <Text size="sm" fw={600}>
                                    {r.score}
                                  </Text>
                                  {r.zero_reason ? (
                                    <Badge size="xs" color="red" variant="light">
                                      {r.zero_reason}
                                    </Badge>
                                  ) : null}
                                </Group>
                              </Stack>
                              <Button
                                size="xs"
                                variant="outline"
                                color="red"
                                loading={deleteBusy === r.id}
                                onClick={() => void handleDelete(r.id)}
                              >
                                Del
                              </Button>
                            </Group>
                          ))}
                      </Stack>
                    );
                  })}
                </Stack>
              </SectionCard>
            );
          })}
        </>
      )}
    </Stack>
  );
}
