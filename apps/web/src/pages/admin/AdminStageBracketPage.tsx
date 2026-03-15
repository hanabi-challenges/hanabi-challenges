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
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, deleteJsonAuth, getJsonAuth, postJsonAuth } from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BracketEntry = {
  id: number;
  event_team_id: number;
  seed: number | null;
  team_display_name: string;
  member_names: string[];
};

type MatchStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';

type MatchRow = {
  id: number;
  round_number: number;
  team1_id: number;
  team2_id: number;
  status: MatchStatus;
  winner_team_id: number | null;
  team1_display_name: string;
  team2_display_name: string;
};

type TeamRow = {
  id: number;
  stage_id: number | null;
  display_name: string;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AdminStageBracketPage() {
  const { slug, stageId } = useParams<{ slug: string; stageId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [entries, setEntries] = useState<BracketEntry[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [eventTeams, setEventTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Add-team form
  const [addTeamId, setAddTeamId] = useState('');
  const [addSeed, setAddSeed] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Action state
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !stageId || !token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [entriesData, matchesData, teamsData] = await Promise.all([
          getJsonAuth<BracketEntry[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/entries`,
            token as string,
          ),
          getJsonAuth<MatchRow[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/matches`,
            token as string,
          ),
          getJsonAuth<TeamRow[]>(`/events/${encodeURIComponent(slug!)}/teams`, token as string),
        ]);
        if (!cancelled) {
          setEntries(entriesData);
          setMatches(matchesData);
          setEventTeams(teamsData);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load bracket data.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, version]);

  async function handleQualify() {
    if (!slug || !stageId || !token) return;
    setActionBusy('qualify');
    setActionError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/entries/qualify`,
        token,
        {},
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Qualify failed.')
          : 'Qualify failed.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleAddTeam() {
    if (!slug || !stageId || !token) return;
    setAddBusy(true);
    setAddError(null);
    const teamId = Number(addTeamId);
    if (!teamId) {
      setAddError('Select a team.');
      setAddBusy(false);
      return;
    }
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/entries`, token, {
        team_id: teamId,
        seed: addSeed ? Number(addSeed) : null,
      });
      setAddTeamId('');
      setAddSeed('');
      setVersion((v) => v + 1);
    } catch (err) {
      setAddError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Add failed.')
          : 'Add failed.',
      );
    } finally {
      setAddBusy(false);
    }
  }

  async function handleRemoveEntry(entryId: number) {
    if (!slug || !stageId || !token) return;
    setActionBusy(`remove-${entryId}`);
    setActionError(null);
    try {
      await deleteJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/entries/${entryId}`,
        token,
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Remove failed.')
          : 'Remove failed.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDraw() {
    if (!slug || !stageId || !token) return;
    setActionBusy('draw');
    setActionError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/bracket/draw`,
        token,
        {},
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Draw failed.')
          : 'Draw failed.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleAdvance() {
    if (!slug || !stageId || !token) return;
    setActionBusy('advance');
    setActionError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/bracket/advance`,
        token,
        {},
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Advance failed.')
          : 'Advance failed.',
      );
    } finally {
      setActionBusy(null);
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

  // Derived state
  const enrolledTeamIds = new Set(entries.map((e) => e.event_team_id));
  const unenrolledTeams = eventTeams.filter((t) => !enrolledTeamIds.has(t.id));
  const teamOptions = unenrolledTeams.map((t) => ({ value: String(t.id), label: t.display_name }));

  const hasMatches = matches.length > 0;

  // Group matches by round
  const roundMap = new Map<number, MatchRow[]>();
  for (const m of matches) {
    if (!roundMap.has(m.round_number)) roundMap.set(m.round_number, []);
    roundMap.get(m.round_number)!.push(m);
  }
  const rounds = [...roundMap.keys()].sort((a, b) => a - b);
  const currentRound = rounds.length > 0 ? Math.max(...rounds) : 0;
  const currentRoundMatches = roundMap.get(currentRound) ?? [];
  const allCurrentComplete =
    currentRoundMatches.length > 0 &&
    currentRoundMatches.every((m) => m.status === 'COMPLETE' && m.winner_team_id !== null);
  const bracketComplete = allCurrentComplete && currentRoundMatches.length === 1;
  const champion = bracketComplete ? currentRoundMatches[0].winner_team_id : null;
  const championName = champion
    ? currentRoundMatches[0].team1_id === champion
      ? currentRoundMatches[0].team1_display_name
      : currentRoundMatches[0].team2_display_name
    : null;

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
      <Group justify="space-between" align="flex-start">
        <PageHeader title="Bracket" level={3} />
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate(`/admin/events/${slug}/stages`)}
        >
          ← Back to Stages
        </Button>
      </Group>

      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

      {/* Champion banner */}
      {bracketComplete && championName ? (
        <Alert color="yellow" variant="filled">
          🏆 Champion: <strong>{championName}</strong>
        </Alert>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Section 1 — Enrollment                                              */}
      {/* ------------------------------------------------------------------ */}
      <SectionCard>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600} size="sm">
              Enrollment ({entries.length} team{entries.length !== 1 ? 's' : ''})
            </Text>
            <Button
              size="xs"
              variant="light"
              loading={actionBusy === 'qualify'}
              disabled={actionBusy !== null && actionBusy !== 'qualify'}
              onClick={() => void handleQualify()}
            >
              Qualify from Prior Stage
            </Button>
          </Group>

          {entries.length === 0 ? (
            <Text size="sm" c="dimmed">
              No teams enrolled yet.
            </Text>
          ) : (
            <Stack gap={4}>
              {entries.map((entry, idx) => (
                <Group key={entry.id} justify="space-between" gap="xs">
                  <Group gap="xs">
                    <Text size="xs" c="dimmed" style={{ width: 24 }}>
                      #{entry.seed ?? idx + 1}
                    </Text>
                    <Text size="sm">{entry.team_display_name}</Text>
                    {entry.member_names.map((name) => (
                      <Badge key={name} size="xs" variant="light" color="blue">
                        {name}
                      </Badge>
                    ))}
                  </Group>
                  <Button
                    size="xs"
                    variant="outline"
                    color="red"
                    disabled={hasMatches || actionBusy !== null}
                    loading={actionBusy === `remove-${entry.id}`}
                    onClick={() => void handleRemoveEntry(entry.id)}
                  >
                    Remove
                  </Button>
                </Group>
              ))}
            </Stack>
          )}

          {/* Add team manually */}
          {unenrolledTeams.length > 0 ? (
            <Stack gap="xs">
              {addError ? (
                <Alert color="red" variant="light">
                  {addError}
                </Alert>
              ) : null}
              <Group gap="xs" align="flex-end">
                <div style={{ flex: 1 }}>
                  <CoreSelect
                    label="Add team"
                    value={addTeamId}
                    onChange={(v) => setAddTeamId(v ?? '')}
                    data={teamOptions}
                    placeholder="Select team…"
                    size="sm"
                  />
                </div>
                <div style={{ width: 80 }}>
                  <TextInput
                    label="Seed"
                    size="sm"
                    value={addSeed}
                    onChange={(e) => setAddSeed(e.currentTarget.value.replace(/\D/g, ''))}
                    placeholder="auto"
                  />
                </div>
                <Button
                  size="sm"
                  loading={addBusy}
                  disabled={!addTeamId}
                  onClick={() => void handleAddTeam()}
                >
                  Add
                </Button>
              </Group>
            </Stack>
          ) : null}
        </Stack>
      </SectionCard>

      {/* ------------------------------------------------------------------ */}
      {/* Section 2 — Draw                                                    */}
      {/* ------------------------------------------------------------------ */}
      {entries.length >= 2 ? (
        <SectionCard>
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Draw
            </Text>
            {hasMatches ? (
              <Text size="sm" c="dimmed">
                Bracket drawn — {matches.length} match{matches.length !== 1 ? 'es' : ''} created.
                Reset entries to redraw.
              </Text>
            ) : (
              <>
                <Text size="sm" c="dimmed">
                  {entries.length} team{entries.length !== 1 ? 's' : ''} enrolled. Run the draw to
                  generate round-1 matches.
                </Text>
                <Group>
                  <Button
                    size="sm"
                    loading={actionBusy === 'draw'}
                    disabled={actionBusy !== null && actionBusy !== 'draw'}
                    onClick={() => void handleDraw()}
                  >
                    Run Draw
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </SectionCard>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Section 3 — Bracket view                                            */}
      {/* ------------------------------------------------------------------ */}
      {hasMatches ? (
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Bracket
          </Text>

          {rounds.map((round) => {
            const roundMatches = roundMap.get(round)!;
            const completeCount = roundMatches.filter((m) => m.status === 'COMPLETE').length;
            const isFinal = roundMatches.length === 1;

            return (
              <Stack key={round} gap="xs">
                <Group gap="xs">
                  <Text size="sm" fw={600}>
                    {isFinal ? 'Final' : `Round ${round}`}
                  </Text>
                  <Badge
                    size="xs"
                    variant="outline"
                    color={completeCount === roundMatches.length ? 'green' : 'yellow'}
                  >
                    {completeCount}/{roundMatches.length} complete
                  </Badge>
                </Group>

                {roundMatches.map((match) => (
                  <SectionCard key={match.id}>
                    <Group justify="space-between" gap="xs">
                      <Stack gap={2}>
                        <Group gap="xs">
                          <Badge size="xs" color={statusColor(match.status)} variant="light">
                            {match.status}
                          </Badge>
                        </Group>
                        <Group gap="xs">
                          <Text
                            size="sm"
                            fw={match.winner_team_id === match.team1_id ? 700 : 400}
                            c={
                              match.winner_team_id !== null &&
                              match.winner_team_id !== match.team1_id
                                ? 'dimmed'
                                : undefined
                            }
                          >
                            {match.team1_display_name}
                          </Text>
                          <Text size="sm" c="dimmed">
                            vs
                          </Text>
                          <Text
                            size="sm"
                            fw={match.winner_team_id === match.team2_id ? 700 : 400}
                            c={
                              match.winner_team_id !== null &&
                              match.winner_team_id !== match.team2_id
                                ? 'dimmed'
                                : undefined
                            }
                          >
                            {match.team2_display_name}
                          </Text>
                          {match.winner_team_id !== null ? (
                            <Badge size="xs" color="green" variant="light">
                              Winner:{' '}
                              {match.winner_team_id === match.team1_id
                                ? match.team1_display_name
                                : match.team2_display_name}
                            </Badge>
                          ) : null}
                        </Group>
                      </Stack>
                    </Group>
                  </SectionCard>
                ))}
              </Stack>
            );
          })}

          {/* Advance */}
          {allCurrentComplete && !bracketComplete ? (
            <Group>
              <Button
                size="sm"
                color="green"
                loading={actionBusy === 'advance'}
                disabled={actionBusy !== null && actionBusy !== 'advance'}
                onClick={() => void handleAdvance()}
              >
                Advance to Round {currentRound + 1}
              </Button>
            </Group>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
