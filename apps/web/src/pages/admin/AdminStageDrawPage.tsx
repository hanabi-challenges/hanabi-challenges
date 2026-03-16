import { useEffect, useState } from 'react';
import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getJsonAuth, postJsonAuth } from '../../lib/api';

type OptIn = {
  id: number;
  user_id: number;
  display_name: string;
  partner_user_id: number | null;
  partner_display_name: string | null;
  partner_confirmed: boolean;
};

type TeamProposal = {
  user_ids: number[];
  display_names: string[];
  kind: 'CONFIRMED_PAIR' | 'PROPOSED_PAIR' | 'PROPOSED_TRIO';
};

type DrawProposal = {
  teams: TeamProposal[];
  unmatched: Array<{ user_id: number; display_name: string }>;
};

type ConfirmedTeam = {
  id: number;
  display_name: string;
  members: Array<{ user_id: number; display_name: string; confirmed: boolean }>;
};

// Swap one player between two teams in the local proposal (client-side only)
function swapPlayers(
  proposal: DrawProposal,
  teamA: number,
  memberA: number,
  teamB: number,
  memberB: number,
): DrawProposal {
  const teams = proposal.teams.map((t) => ({
    ...t,
    display_names: [...t.display_names],
    user_ids: [...t.user_ids],
  }));
  const uidA = teams[teamA].user_ids[memberA];
  const nameA = teams[teamA].display_names[memberA];
  const uidB = teams[teamB].user_ids[memberB];
  const nameB = teams[teamB].display_names[memberB];
  teams[teamA].user_ids[memberA] = uidB;
  teams[teamA].display_names[memberA] = nameB;
  teams[teamB].user_ids[memberB] = uidA;
  teams[teamB].display_names[memberB] = nameA;
  // After swap, these teams are no longer CONFIRMED_PAIR
  if (teams[teamA].kind === 'CONFIRMED_PAIR')
    teams[teamA] = { ...teams[teamA], kind: 'PROPOSED_PAIR' };
  if (teams[teamB].kind === 'CONFIRMED_PAIR')
    teams[teamB] = { ...teams[teamB], kind: 'PROPOSED_PAIR' };
  return { ...proposal, teams };
}

export function AdminStageDrawPage() {
  const { slug, stageId } = useParams<{ slug: string; stageId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [optIns, setOptIns] = useState<OptIn[]>([]);
  const [confirmedTeams, setConfirmedTeams] = useState<ConfirmedTeam[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [proposal, setProposal] = useState<DrawProposal | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Swap selection state: null or { teamIdx, memberIdx }
  const [swapSel, setSwapSel] = useState<{ teamIdx: number; memberIdx: number } | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !stageId || !token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const [optInsData, teamsData] = await Promise.all([
          getJsonAuth<OptIn[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/opt-ins`,
            token as string,
          ),
          getJsonAuth<ConfirmedTeam[]>(
            `/events/${encodeURIComponent(slug!)}/teams`,
            token as string,
          ),
        ]);
        if (!cancelled) {
          setOptIns(optInsData);
          // Filter to teams for this stage
          const stageTeams = teamsData.filter(
            (t) => (t as unknown as { stage_id: number | null }).stage_id === Number(stageId),
          );
          setConfirmedTeams(stageTeams);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load draw data.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, version]);

  async function handlePreview() {
    if (!token || !slug || !stageId) return;
    setPreviewError(null);
    setPreviewBusy(true);
    setSwapSel(null);
    try {
      const result = await postJsonAuth<DrawProposal>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/draw`,
        token,
        {},
      );
      setProposal(result);
    } catch (err) {
      setPreviewError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Preview failed.')
          : 'Preview failed.',
      );
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleConfirm() {
    if (!token || !slug || !stageId) return;
    setConfirmError(null);
    setConfirmBusy(true);
    try {
      const teams = await postJsonAuth<ConfirmedTeam[]>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/draw/confirm`,
        token,
        {},
      );
      setProposal(null);
      setSwapSel(null);
      setConfirmedTeams(teams);
      setVersion((v) => v + 1);
    } catch (err) {
      setConfirmError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Confirm failed.')
          : 'Confirm failed.',
      );
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleReset() {
    if (!token || !slug || !stageId) return;
    if (!confirm('Reset the draw? This will delete all QUEUED teams for this stage.')) return;
    setResetError(null);
    setResetBusy(true);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/draw/reset`,
        token,
        {},
      );
      setProposal(null);
      setSwapSel(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setResetError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Reset failed.')
          : 'Reset failed.',
      );
    } finally {
      setResetBusy(false);
    }
  }

  function handleSwapClick(teamIdx: number, memberIdx: number) {
    if (!proposal) return;
    // Cannot swap members of CONFIRMED_PAIR — they mutually agreed
    if (swapSel === null) {
      setSwapSel({ teamIdx, memberIdx });
    } else if (swapSel.teamIdx === teamIdx && swapSel.memberIdx === memberIdx) {
      // Deselect
      setSwapSel(null);
    } else if (swapSel.teamIdx === teamIdx) {
      // Same team — deselect and re-select new member
      setSwapSel({ teamIdx, memberIdx });
    } else {
      // Different team — perform swap
      setProposal(swapPlayers(proposal, swapSel.teamIdx, swapSel.memberIdx, teamIdx, memberIdx));
      setSwapSel(null);
    }
  }

  function kindColor(kind: TeamProposal['kind']): string {
    switch (kind) {
      case 'CONFIRMED_PAIR':
        return 'green';
      case 'PROPOSED_PAIR':
        return 'blue';
      case 'PROPOSED_TRIO':
        return 'violet';
    }
  }

  function kindLabel(kind: TeamProposal['kind']): string {
    switch (kind) {
      case 'CONFIRMED_PAIR':
        return 'Pre-arranged';
      case 'PROPOSED_PAIR':
        return 'Proposed pair';
      case 'PROPOSED_TRIO':
        return 'Proposed trio';
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

  const drawConfirmed = confirmedTeams.length > 0;
  const pairedOptIns = optIns.filter((o) => o.partner_confirmed);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <PageHeader title="QUEUED Draw" level={3} />
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate(`/admin/events/${slug}/stages`)}
        >
          ← Back to Stages
        </Button>
      </Group>

      {/* Opt-ins summary */}
      <SectionCard>
        <Stack gap="sm">
          <Group gap="xs">
            <Text fw={600} size="sm">
              Opt-ins ({optIns.length})
            </Text>
            {pairedOptIns.length > 0 ? (
              <Badge color="green" variant="light" size="sm">
                {pairedOptIns.length / 2} pre-arranged pair
                {pairedOptIns.length / 2 !== 1 ? 's' : ''}
              </Badge>
            ) : null}
          </Group>

          {optIns.length === 0 ? (
            <Text size="sm" c="dimmed">
              No opt-ins yet.
            </Text>
          ) : (
            optIns.map((o) => (
              <Group key={o.id} gap="xs">
                <Text size="sm">{o.display_name}</Text>
                {o.partner_display_name ? (
                  <Badge
                    variant={o.partner_confirmed ? 'light' : 'outline'}
                    color={o.partner_confirmed ? 'green' : 'gray'}
                    size="xs"
                  >
                    Partner: {o.partner_display_name}
                    {o.partner_confirmed ? ' ✓' : ' (pending)'}
                  </Badge>
                ) : null}
              </Group>
            ))
          )}
        </Stack>
      </SectionCard>

      {/* Draw confirmed state */}
      {drawConfirmed ? (
        <>
          <Alert color="green" variant="light">
            Draw confirmed — {confirmedTeams.length} team{confirmedTeams.length !== 1 ? 's' : ''}{' '}
            created.
          </Alert>

          <Stack gap="xs">
            {confirmedTeams.map((team) => (
              <SectionCard key={team.id}>
                <Group gap="xs">
                  <Text fw={600} size="sm">
                    {team.display_name}
                  </Text>
                  {team.members.map((m) => (
                    <Badge key={m.user_id} variant="light" size="xs" color="blue">
                      {m.display_name}
                    </Badge>
                  ))}
                </Group>
              </SectionCard>
            ))}
          </Stack>

          {resetError ? (
            <Alert color="red" variant="light">
              {resetError}
            </Alert>
          ) : null}

          <Group>
            <Button
              color="red"
              variant="light"
              size="sm"
              loading={resetBusy}
              onClick={() => void handleReset()}
            >
              Reset Draw
            </Button>
          </Group>
        </>
      ) : (
        <>
          {/* Preview / confirm controls */}
          {previewError ? (
            <Alert color="red" variant="light">
              {previewError}
            </Alert>
          ) : null}

          {!proposal ? (
            <Group>
              <Button
                size="sm"
                loading={previewBusy}
                disabled={optIns.length === 0}
                onClick={() => void handlePreview()}
              >
                Preview Draw
              </Button>
            </Group>
          ) : (
            <>
              {proposal.unmatched.length > 0 ? (
                <Alert color="red" variant="filled">
                  ⚠ {proposal.unmatched.length} player
                  {proposal.unmatched.length !== 1 ? 's' : ''} cannot be paired:{' '}
                  {proposal.unmatched.map((u) => u.display_name).join(', ')}
                </Alert>
              ) : null}

              <Stack gap="xs">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    Proposed Teams ({proposal.teams.length})
                  </Text>
                  <Group gap="xs">
                    <Text size="xs" c="dimmed">
                      {swapSel !== null
                        ? `Swapping: ${proposal.teams[swapSel.teamIdx].display_names[swapSel.memberIdx]} — click another player to swap`
                        : 'Click a player to start a swap'}
                    </Text>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={swapSel === null}
                      onClick={() => setSwapSel(null)}
                    >
                      Cancel swap
                    </Button>
                  </Group>
                </Group>

                {proposal.teams.map((team, teamIdx) => (
                  <SectionCard key={teamIdx}>
                    <Group justify="space-between">
                      <Stack gap={4}>
                        <Badge color={kindColor(team.kind)} variant="light" size="xs">
                          {kindLabel(team.kind)}
                        </Badge>
                        <Group gap="xs">
                          {team.display_names.map((name, memberIdx) => {
                            const isSelected =
                              swapSel?.teamIdx === teamIdx && swapSel?.memberIdx === memberIdx;
                            return (
                              <Button
                                key={memberIdx}
                                size="xs"
                                variant={isSelected ? 'filled' : 'light'}
                                color={isSelected ? 'orange' : 'blue'}
                                onClick={() => handleSwapClick(teamIdx, memberIdx)}
                              >
                                {name}
                              </Button>
                            );
                          })}
                        </Group>
                      </Stack>
                    </Group>
                  </SectionCard>
                ))}
              </Stack>

              <Alert color="yellow" variant="light">
                Note: Confirm will re-run the draw algorithm server-side. Manual swaps shown above
                are for review only and will not be applied.
              </Alert>

              {confirmError ? (
                <Alert color="red" variant="light">
                  {confirmError}
                </Alert>
              ) : null}

              <Group gap="sm">
                <Button
                  size="sm"
                  loading={previewBusy}
                  variant="default"
                  onClick={() => void handlePreview()}
                >
                  Re-run Preview
                </Button>
                <Button
                  size="sm"
                  color="green"
                  loading={confirmBusy}
                  onClick={() => void handleConfirm()}
                >
                  Confirm Draw
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => {
                    setProposal(null);
                    setSwapSel(null);
                  }}
                >
                  Discard Preview
                </Button>
              </Group>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
