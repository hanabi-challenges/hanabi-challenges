import { useState } from 'react';
import {
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreDivider as Divider,
  CoreGroup as Group,
  CoreSelect,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  FormContainer,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useStages } from '../../hooks/useStages';
import {
  useStageRelationships,
  type FilterType,
  type SeedingMethod,
} from '../../hooks/useStageRelationships';
import { useAuth } from '../../context/AuthContext';
import { ApiError, deleteJsonAuth, patchJsonAuth, postJsonAuth } from '../../lib/api';

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'blue';
    case 'GAUNTLET':
      return 'violet';
    case 'MATCH_PLAY':
      return 'orange';
    default:
      return 'gray';
  }
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

function filterTypeLabel(t: FilterType): string {
  switch (t) {
    case 'ALL':
      return 'All';
    case 'TOP_N':
      return 'Top N';
    case 'THRESHOLD':
      return 'Threshold';
    case 'MANUAL':
      return 'Manual';
  }
}

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'ALL', label: 'All teams' },
  { value: 'TOP_N', label: 'Top N' },
  { value: 'THRESHOLD', label: 'Threshold' },
  { value: 'MANUAL', label: 'Manual' },
];

const SEEDING_METHODS: { value: SeedingMethod; label: string }[] = [
  { value: 'RANKED', label: 'Ranked' },
  { value: 'RANDOM', label: 'Random' },
  { value: 'MANUAL', label: 'Manual' },
];

export function AdminEventStagesPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const {
    stages,
    loading: stagesLoading,
    error: stagesError,
    refetch: refetchStages,
  } = useStages(slug);
  const {
    relationships,
    loading: relsLoading,
    error: relsError,
    refetch: refetchRels,
  } = useStageRelationships(slug);

  const [actionError, setActionError] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState<number | null>(null);

  // Add-relationship form state
  const [addSourceId, setAddSourceId] = useState('');
  const [addTargetId, setAddTargetId] = useState('');
  const [addFilterType, setAddFilterType] = useState<FilterType>('ALL');
  const [addFilterValue, setAddFilterValue] = useState('');
  const [addSeedingMethod, setAddSeedingMethod] = useState<SeedingMethod>('RANKED');
  const [relFormError, setRelFormError] = useState<string | null>(null);
  const [relBusy, setRelBusy] = useState(false);

  async function handleReorder(stageId: number, newIndex: number) {
    if (!token || !slug) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/reorder`, token, {
        new_index: newIndex,
      });
      refetchStages();
    } catch {
      setActionError('Failed to reorder stage.');
    } finally {
      setStageBusy(null);
    }
  }

  async function handleCloneStage(stageId: number) {
    if (!token || !slug) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/clone`, token, {});
      refetchStages();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to clone stage.')
          : 'Failed to clone stage.',
      );
    } finally {
      setStageBusy(null);
    }
  }

  async function handleDeleteStage(stageId: number) {
    if (!token || !slug) return;
    if (!confirm('Delete this stage? This cannot be undone.')) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}`, token);
      refetchStages();
      refetchRels();
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to delete stage.')
          : 'Failed to delete stage.',
      );
    } finally {
      setStageBusy(null);
    }
  }

  async function handleAddRelationship() {
    if (!token || !slug) return;
    setRelFormError(null);

    const sourceId = Number(addSourceId);
    const targetId = Number(addTargetId);
    if (!sourceId) {
      setRelFormError('Source stage is required.');
      return;
    }
    if (!targetId) {
      setRelFormError('Target stage is required.');
      return;
    }
    if (sourceId === targetId) {
      setRelFormError('Source and target must be different stages.');
      return;
    }
    if ((addFilterType === 'TOP_N' || addFilterType === 'THRESHOLD') && !addFilterValue) {
      setRelFormError('Filter value is required for Top N and Threshold filter types.');
      return;
    }

    setRelBusy(true);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stage-relationships`, token, {
        source_stage_id: sourceId,
        target_stage_id: targetId,
        filter_type: addFilterType,
        filter_value: addFilterValue ? Number(addFilterValue) : null,
        seeding_method: addSeedingMethod,
      });
      setAddSourceId('');
      setAddTargetId('');
      setAddFilterType('ALL');
      setAddFilterValue('');
      setAddSeedingMethod('RANKED');
      refetchRels();
    } catch (err) {
      setRelFormError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to add relationship.')
          : 'Failed to add relationship.',
      );
    } finally {
      setRelBusy(false);
    }
  }

  async function handleDeleteRelationship(id: number) {
    if (!token || !slug) return;
    setRelFormError(null);
    try {
      await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/stage-relationships/${id}`, token);
      refetchRels();
    } catch {
      setRelFormError('Failed to delete relationship.');
    }
  }

  // Build stage ID → label lookup
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  // Flow warnings (only meaningful with >1 stage)
  const flowWarnings: string[] = [];
  if (stages.length > 1) {
    const hasIncoming = new Set(relationships.map((r) => r.target_stage_id));
    const hasOutgoing = new Set(relationships.map((r) => r.source_stage_id));
    const sortedByIndex = [...stages].sort((a, b) => a.stage_index - b.stage_index);
    const firstStageId = sortedByIndex[0].id;
    const lastStageId = sortedByIndex[sortedByIndex.length - 1].id;

    for (const stage of stages) {
      if (!hasIncoming.has(stage.id) && stage.id !== firstStageId) {
        flowWarnings.push(`"${stage.label}" has no incoming relationship — it may be unreachable.`);
      }
      if (!hasOutgoing.has(stage.id) && stage.id !== lastStageId) {
        flowWarnings.push(`"${stage.label}" has no outgoing relationship — it may be a dead end.`);
      }
    }
  }

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

  const stageOptions = stages.map((s) => ({ value: String(s.id), label: s.label }));

  return (
    <Stack gap="md">
      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

      {/* Stages list */}
      <Group justify="space-between">
        <Text fw={600} size="sm">
          Stages ({stages.length})
        </Text>
        <Button size="sm" onClick={() => navigate(`/admin/events/${slug}/stages/new`)}>
          Add Stage
        </Button>
      </Group>

      {stages.length === 0 ? (
        <Text c="dimmed" size="sm">
          No stages yet. Add one to get started.
        </Text>
      ) : (
        stages.map((stage, index) => (
          <SectionCard key={stage.id}>
            <Group justify="space-between" align="flex-start">
              <Stack gap="xs">
                <Group gap="xs">
                  <Text fw={600} size="sm">
                    {stage.label}
                  </Text>
                  <Badge color={mechanismColor(stage.mechanism)} variant="light" size="sm">
                    {mechanismLabel(stage.mechanism)}
                  </Badge>
                  <Badge variant="light" size="sm">
                    {stage.status}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">
                  {stage.game_slot_count} game slot{stage.game_slot_count === 1 ? '' : 's'} ·{' '}
                  {stage.team_count} team{stage.team_count === 1 ? '' : 's'}
                </Text>
              </Stack>

              <Group gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={stageBusy !== null || index === 0}
                  onClick={() => void handleReorder(stage.id, index - 1)}
                >
                  ↑
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={stageBusy !== null || index === stages.length - 1}
                  onClick={() => void handleReorder(stage.id, index + 1)}
                >
                  ↓
                </Button>
                {stage.team_policy === 'QUEUED' ? (
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => navigate(`/admin/events/${slug}/stages/${stage.id}/draw`)}
                  >
                    Draw
                  </Button>
                ) : null}
                {stage.mechanism === 'MATCH_PLAY' ? (
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() => navigate(`/admin/events/${slug}/stages/${stage.id}/bracket`)}
                  >
                    Bracket
                  </Button>
                ) : null}
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => navigate(`/admin/events/${slug}/stages/${stage.id}/games`)}
                >
                  Slots
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  disabled={stageBusy === stage.id}
                  onClick={() => void handleCloneStage(stage.id)}
                >
                  Clone
                </Button>
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => navigate(`/admin/events/${slug}/stages/${stage.id}/edit`)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  color="red"
                  size="xs"
                  disabled={stageBusy === stage.id}
                  onClick={() => void handleDeleteStage(stage.id)}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          </SectionCard>
        ))
      )}

      {/* Stage flow (relationships) — only shown when there are stages */}
      {stages.length > 0 ? (
        <>
          <Divider />

          <Text fw={600} size="sm">
            Stage Flow
          </Text>

          {relsError ? (
            <Alert color="red" variant="light">
              {relsError}
            </Alert>
          ) : null}

          {flowWarnings.map((w) => (
            <Alert key={w} color="yellow" variant="light">
              {w}
            </Alert>
          ))}

          {/* Existing relationships */}
          {!relsLoading && relationships.length === 0 ? (
            <Text size="sm" c="dimmed">
              No stage relationships defined.
            </Text>
          ) : null}

          {relationships.map((rel) => {
            const sourceStage = stageMap.get(rel.source_stage_id);
            const targetStage = stageMap.get(rel.target_stage_id);
            const sourceLabel = sourceStage?.label ?? `Stage ${rel.source_stage_id}`;
            const targetLabel = targetStage?.label ?? `Stage ${rel.target_stage_id}`;
            const filterDesc =
              rel.filter_type === 'ALL'
                ? 'all teams'
                : rel.filter_type === 'TOP_N'
                  ? `top ${rel.filter_value}`
                  : rel.filter_type === 'THRESHOLD'
                    ? `score ≥ ${rel.filter_value}`
                    : 'manual selection';

            return (
              <SectionCard key={rel.id}>
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Text size="sm">
                      <strong>{sourceLabel}</strong> → <strong>{targetLabel}</strong>
                    </Text>
                    <Text size="xs" c="dimmed">
                      Filter: {filterTypeLabel(rel.filter_type)} ({filterDesc}) · Seeding:{' '}
                      {rel.seeding_method.toLowerCase()}
                    </Text>
                  </Stack>
                  <Button
                    variant="outline"
                    color="red"
                    size="xs"
                    onClick={() => void handleDeleteRelationship(rel.id)}
                  >
                    Remove
                  </Button>
                </Group>
              </SectionCard>
            );
          })}

          {/* Add relationship form */}
          <SectionCard>
            <Stack gap="sm">
              <Text fw={600} size="sm">
                Add Relationship
              </Text>

              {relFormError ? (
                <Alert color="red" variant="light">
                  {relFormError}
                </Alert>
              ) : null}

              <FormContainer>
                <Group grow>
                  <CoreSelect
                    label="Source Stage"
                    placeholder="Select source"
                    value={addSourceId}
                    onChange={(v) => setAddSourceId(v ?? '')}
                    data={stageOptions}
                  />
                  <CoreSelect
                    label="Target Stage"
                    placeholder="Select target"
                    value={addTargetId}
                    onChange={(v) => setAddTargetId(v ?? '')}
                    data={stageOptions}
                  />
                </Group>

                <Group grow>
                  <CoreSelect
                    label="Filter Type"
                    value={addFilterType}
                    onChange={(v) => {
                      setAddFilterType((v ?? 'ALL') as FilterType);
                      if (v === 'ALL' || v === 'MANUAL') setAddFilterValue('');
                    }}
                    data={FILTER_TYPES}
                  />
                  <TextInput
                    label="Filter Value"
                    placeholder={
                      addFilterType === 'TOP_N'
                        ? 'e.g. 8'
                        : addFilterType === 'THRESHOLD'
                          ? 'e.g. 20'
                          : '—'
                    }
                    value={addFilterValue}
                    onChange={(e) => setAddFilterValue(e.currentTarget.value.replace(/[^\d]/g, ''))}
                    disabled={addFilterType === 'ALL' || addFilterType === 'MANUAL'}
                  />
                  <CoreSelect
                    label="Seeding Method"
                    value={addSeedingMethod}
                    onChange={(v) => setAddSeedingMethod((v ?? 'RANKED') as SeedingMethod)}
                    data={SEEDING_METHODS}
                  />
                </Group>

                <Group justify="flex-end">
                  <Button size="sm" loading={relBusy} onClick={() => void handleAddRelationship()}>
                    Add
                  </Button>
                </Group>
              </FormContainer>
            </Stack>
          </SectionCard>
        </>
      ) : null}
    </Stack>
  );
}
