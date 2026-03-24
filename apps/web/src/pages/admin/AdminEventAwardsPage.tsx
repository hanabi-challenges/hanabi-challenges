import { useEffect, useState } from 'react';
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
// Types
// ---------------------------------------------------------------------------

type CriteriaType = 'RANK_POSITION' | 'SCORE_THRESHOLD' | 'PARTICIPATION' | 'MANUAL';
type Attribution = 'INDIVIDUAL' | 'TEAM';

type AwardRow = {
  id: number;
  stage_id: number | null;
  name: string;
  description: string | null;
  icon: string | null;
  criteria_type: CriteriaType;
  criteria_value: Record<string, unknown> | null;
  attribution: Attribution;
  team_size: number | null;
  sort_order: number;
};

type GroupedAwardsResponse = {
  event_awards: AwardRow[];
  stage_awards: { stage_id: number; stage_label: string; awards: AwardRow[] }[];
};

type AwardFormState = {
  name: string;
  description: string;
  icon: string;
  criteria_type: CriteriaType;
  rank_positions: string;
  score_threshold_mode: 'score' | 'percentage';
  score_threshold_value: string;
  participation_min_stages: string;
  attribution: Attribution;
  team_size: string;
};

const DEFAULT_FORM: AwardFormState = {
  name: '',
  description: '',
  icon: '',
  criteria_type: 'RANK_POSITION',
  rank_positions: '',
  score_threshold_mode: 'score',
  score_threshold_value: '',
  participation_min_stages: '1',
  attribution: 'INDIVIDUAL',
  team_size: '',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function awardToForm(award: AwardRow): AwardFormState {
  const cv = award.criteria_value;
  let rank_positions = '';
  let score_threshold_mode: 'score' | 'percentage' = 'score';
  let score_threshold_value = '';
  let participation_min_stages = '1';

  if (award.criteria_type === 'RANK_POSITION' && cv?.positions) {
    rank_positions = (cv.positions as number[]).join(', ');
  } else if (award.criteria_type === 'SCORE_THRESHOLD' && cv) {
    if (cv.min_score !== undefined) {
      score_threshold_mode = 'score';
      score_threshold_value = String(cv.min_score);
    } else if (cv.min_percentage !== undefined) {
      score_threshold_mode = 'percentage';
      score_threshold_value = String(Math.round((cv.min_percentage as number) * 100));
    }
  } else if (award.criteria_type === 'PARTICIPATION' && cv) {
    participation_min_stages = String(cv.min_stages ?? 1);
  }

  return {
    name: award.name,
    description: award.description ?? '',
    icon: award.icon ?? '',
    criteria_type: award.criteria_type,
    rank_positions,
    score_threshold_mode,
    score_threshold_value,
    participation_min_stages,
    attribution: award.attribution,
    team_size: award.team_size !== null ? String(award.team_size) : '',
  };
}

function buildCriteriaValue(form: AwardFormState): Record<string, unknown> | null {
  switch (form.criteria_type) {
    case 'RANK_POSITION': {
      const positions = form.rank_positions
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      return { positions };
    }
    case 'SCORE_THRESHOLD':
      return form.score_threshold_mode === 'score'
        ? { min_score: Number(form.score_threshold_value) }
        : { min_percentage: Number(form.score_threshold_value) / 100 };
    case 'PARTICIPATION':
      return { min_stages: Number(form.participation_min_stages) };
    case 'MANUAL':
      return null;
  }
}

function criteriaLabel(award: AwardRow): string {
  const cv = award.criteria_value;
  switch (award.criteria_type) {
    case 'RANK_POSITION':
      return `Positions: ${((cv?.positions as number[]) ?? []).join(', ')}`;
    case 'SCORE_THRESHOLD':
      if (cv?.min_score !== undefined) return `Score ≥ ${cv.min_score}`;
      if (cv?.min_percentage !== undefined)
        return `Score ≥ ${Math.round((cv.min_percentage as number) * 100)}%`;
      return 'Score threshold';
    case 'PARTICIPATION':
      return `Participated in ≥ ${cv?.min_stages ?? '?'} stage${cv?.min_stages !== 1 ? 's' : ''}`;
    case 'MANUAL':
      return 'Manual grant';
  }
}

// ---------------------------------------------------------------------------
// AwardForm component
// ---------------------------------------------------------------------------

type AwardFormProps = {
  form: AwardFormState;
  onChange: (form: AwardFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  error: string | null;
  isEdit: boolean;
};

function AwardForm({ form, onChange, onSave, onCancel, busy, error, isEdit }: AwardFormProps) {
  const f = form;
  const set = (patch: Partial<AwardFormState>) => onChange({ ...f, ...patch });

  return (
    <FormContainer>
      {error ? (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      ) : null}

      <Group grow>
        <TextInput
          label="Name"
          value={f.name}
          onChange={(e) => set({ name: e.currentTarget.value })}
          placeholder="e.g. Perfect Score"
          required
        />
        <TextInput
          label="Icon (emoji)"
          value={f.icon}
          onChange={(e) => set({ icon: e.currentTarget.value })}
          placeholder="🏆"
          style={{ maxWidth: 120 }}
        />
      </Group>

      <TextInput
        label="Description (optional)"
        value={f.description}
        onChange={(e) => set({ description: e.currentTarget.value })}
        placeholder="Awarded to…"
      />

      <Group grow align="flex-start">
        <CoreSelect
          label="Criteria Type"
          value={f.criteria_type}
          onChange={(v) => set({ criteria_type: (v ?? 'MANUAL') as CriteriaType })}
          data={[
            { value: 'RANK_POSITION', label: 'Rank Position' },
            { value: 'SCORE_THRESHOLD', label: 'Score Threshold' },
            { value: 'PARTICIPATION', label: 'Participation' },
            { value: 'MANUAL', label: 'Manual' },
          ]}
        />
        <CoreSelect
          label="Attribution"
          value={f.attribution}
          onChange={(v) => set({ attribution: (v ?? 'INDIVIDUAL') as Attribution })}
          data={[
            { value: 'INDIVIDUAL', label: 'Individual' },
            { value: 'TEAM', label: 'Team' },
          ]}
        />
        <TextInput
          label="Team Size (optional)"
          value={f.team_size}
          onChange={(e) => set({ team_size: e.currentTarget.value.replace(/\D/g, '') })}
          placeholder="any"
          style={{ maxWidth: 120 }}
        />
      </Group>

      {/* Dynamic criteria value form */}
      {f.criteria_type === 'RANK_POSITION' ? (
        <TextInput
          label="Positions (comma-separated)"
          value={f.rank_positions}
          onChange={(e) => set({ rank_positions: e.currentTarget.value })}
          placeholder="1, 2, 3"
          description="Enter rank positions that qualify, e.g. 1 for winner only"
        />
      ) : f.criteria_type === 'SCORE_THRESHOLD' ? (
        <Group grow align="flex-end">
          <CoreSelect
            label="Threshold type"
            value={f.score_threshold_mode}
            onChange={(v) =>
              set({ score_threshold_mode: (v ?? 'score') as 'score' | 'percentage' })
            }
            data={[
              { value: 'score', label: 'Min score' },
              { value: 'percentage', label: 'Min % of max score' },
            ]}
          />
          <TextInput
            label={f.score_threshold_mode === 'score' ? 'Score value' : 'Percentage (0–100)'}
            value={f.score_threshold_value}
            onChange={(e) =>
              set({ score_threshold_value: e.currentTarget.value.replace(/[^\d.]/g, '') })
            }
            placeholder={f.score_threshold_mode === 'score' ? 'e.g. 25' : 'e.g. 80'}
          />
        </Group>
      ) : f.criteria_type === 'PARTICIPATION' ? (
        <TextInput
          label="Minimum stages participated"
          value={f.participation_min_stages}
          onChange={(e) =>
            set({ participation_min_stages: e.currentTarget.value.replace(/\D/g, '') })
          }
          placeholder="1"
        />
      ) : null}

      <Group justify="flex-end" gap="xs">
        <Button size="sm" variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" loading={busy} onClick={onSave}>
          {isEdit ? 'Save Changes' : 'Add Award'}
        </Button>
      </Group>
    </FormContainer>
  );
}

// ---------------------------------------------------------------------------
// AwardSection component — renders awards for one scope (event or stage)
// ---------------------------------------------------------------------------

type AwardSectionProps = {
  title: string;
  awards: AwardRow[];
  scopeKey: string;
  onMoveUp: (award: AwardRow, awards: AwardRow[]) => void;
  onMoveDown: (award: AwardRow, awards: AwardRow[]) => void;
  onEdit: (award: AwardRow) => void;
  onDelete: (awardId: number) => void;
  onEvaluate: (scopeKey: string, stageId: number | null) => void;
  stageId: number | null;
  actionBusy: string | null;
  evalBusy: string | null;
  evalResult: { grants_created: number } | null;
  formContext: { scopeKey: string; awardId: number | null } | null;
  form: AwardFormState;
  onFormChange: (form: AwardFormState) => void;
  onFormSave: () => void;
  onFormCancel: () => void;
  formBusy: boolean;
  formError: string | null;
  onStartAdd: (scopeKey: string, stageId: number | null) => void;
};

function AwardSection({
  title,
  awards,
  scopeKey,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  onEvaluate,
  stageId,
  actionBusy,
  evalBusy,
  evalResult,
  formContext,
  form,
  onFormChange,
  onFormSave,
  onFormCancel,
  formBusy,
  formError,
  onStartAdd,
}: AwardSectionProps) {
  const isAddingHere = formContext?.scopeKey === scopeKey && formContext.awardId === null;
  const editingAwardId = formContext?.scopeKey === scopeKey ? formContext.awardId : null;

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Group gap="xs">
          <Button
            size="xs"
            variant="light"
            color="violet"
            loading={evalBusy === scopeKey}
            disabled={evalBusy !== null && evalBusy !== scopeKey}
            onClick={() => onEvaluate(scopeKey, stageId)}
          >
            Evaluate Awards
          </Button>
        </Group>
      </Group>

      {evalResult ? (
        <Alert color={evalResult.grants_created > 0 ? 'green' : 'blue'} variant="light">
          {evalResult.grants_created > 0
            ? `${evalResult.grants_created} new grant${evalResult.grants_created !== 1 ? 's' : ''} created.`
            : 'No new grants — all up to date.'}
        </Alert>
      ) : null}

      {awards.length === 0 && !isAddingHere ? (
        <Text size="sm" c="dimmed">
          No awards defined.
        </Text>
      ) : null}

      {awards.map((award, index) => {
        const isEditing = editingAwardId === award.id;
        return (
          <SectionCard key={award.id}>
            {isEditing ? (
              <AwardForm
                form={form}
                onChange={onFormChange}
                onSave={onFormSave}
                onCancel={onFormCancel}
                busy={formBusy}
                error={formError}
                isEdit
              />
            ) : (
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Group gap="xs">
                    {award.icon ? <Text size="sm">{award.icon}</Text> : null}
                    <Text size="sm" fw={600}>
                      {award.name}
                    </Text>
                    <Badge size="xs" variant="light" color="violet">
                      {award.criteria_type}
                    </Badge>
                    <Badge
                      size="xs"
                      variant="outline"
                      color={award.attribution === 'TEAM' ? 'blue' : 'gray'}
                    >
                      {award.attribution}
                    </Badge>
                    {award.team_size !== null ? (
                      <Badge size="xs" variant="outline" color="gray">
                        {award.team_size}p
                      </Badge>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {criteriaLabel(award)}
                  </Text>
                  {award.description ? (
                    <Text size="xs" c="dimmed">
                      {award.description}
                    </Text>
                  ) : null}
                </Stack>
                <Group gap={4}>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={index === 0 || actionBusy !== null || formContext !== null}
                    onClick={() => onMoveUp(award, awards)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={
                      index === awards.length - 1 || actionBusy !== null || formContext !== null
                    }
                    onClick={() => onMoveDown(award, awards)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="xs"
                    variant="default"
                    disabled={formContext !== null}
                    onClick={() => onEdit(award)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    color="red"
                    disabled={actionBusy !== null || formContext !== null}
                    loading={actionBusy === `delete-${award.id}`}
                    onClick={() => onDelete(award.id)}
                  >
                    Delete
                  </Button>
                </Group>
              </Group>
            )}
          </SectionCard>
        );
      })}

      {isAddingHere ? (
        <SectionCard>
          <AwardForm
            form={form}
            onChange={onFormChange}
            onSave={onFormSave}
            onCancel={onFormCancel}
            busy={formBusy}
            error={formError}
            isEdit={false}
          />
        </SectionCard>
      ) : (
        <Button
          size="xs"
          variant="subtle"
          disabled={formContext !== null}
          onClick={() => onStartAdd(scopeKey, stageId)}
        >
          + Add Award
        </Button>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminEventAwardsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token } = useAuth();
  const { stages } = useStages(slug);

  const [awardsData, setAwardsData] = useState<GroupedAwardsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // Form state
  const [formContext, setFormContext] = useState<{
    scopeKey: string;
    stageId: number | null;
    awardId: number | null;
  } | null>(null);
  const [form, setForm] = useState<AwardFormState>(DEFAULT_FORM);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Action state
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Eval state
  const [evalBusy, setEvalBusy] = useState<string | null>(null);
  const [evalResults, setEvalResults] = useState<Map<string, { grants_created: number }>>(
    new Map(),
  );

  useEffect(() => {
    if (!slug || !token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getJsonAuth<GroupedAwardsResponse>(
          `/events/${encodeURIComponent(slug!)}/awards`,
          token as string,
        );
        if (!cancelled) {
          setAwardsData(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load awards.');
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, token, version]);

  function startAdd(scopeKey: string, stageId: number | null) {
    setFormContext({ scopeKey, stageId, awardId: null });
    setForm(DEFAULT_FORM);
    setFormError(null);
  }

  function startEdit(award: AwardRow) {
    const scopeKey = award.stage_id === null ? 'event' : `stage-${award.stage_id}`;
    setFormContext({ scopeKey, stageId: award.stage_id, awardId: award.id });
    setForm(awardToForm(award));
    setFormError(null);
  }

  function cancelForm() {
    setFormContext(null);
    setFormError(null);
  }

  async function handleFormSave() {
    if (!slug || !token || !formContext) return;
    setFormBusy(true);
    setFormError(null);

    if (!form.name.trim()) {
      setFormError('Name is required.');
      setFormBusy(false);
      return;
    }

    const body = {
      stage_id: formContext.stageId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      icon: form.icon.trim() || null,
      criteria_type: form.criteria_type,
      criteria_value: buildCriteriaValue(form),
      attribution: form.attribution,
      team_size: form.team_size ? Number(form.team_size) : null,
    };

    try {
      if (formContext.awardId === null) {
        await postJsonAuth(`/events/${encodeURIComponent(slug)}/awards`, token, body);
      } else {
        await putJsonAuth(
          `/events/${encodeURIComponent(slug)}/awards/${formContext.awardId}`,
          token,
          body,
        );
      }
      setFormContext(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setFormError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Save failed.')
          : 'Save failed.',
      );
    } finally {
      setFormBusy(false);
    }
  }

  async function handleDelete(awardId: number) {
    if (!slug || !token) return;
    if (!confirm('Delete this award? This cannot be undone.')) return;
    const key = `delete-${awardId}`;
    setActionBusy(key);
    setActionError(null);
    try {
      await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/awards/${awardId}`, token);
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Delete failed.')
          : 'Delete failed.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleReorder(award: AwardRow, awards: AwardRow[], direction: 'up' | 'down') {
    if (!slug || !token) return;
    const idx = awards.indexOf(award);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= awards.length) return;
    const other = awards[swapIdx];
    const key = `reorder-${award.id}`;
    setActionBusy(key);
    setActionError(null);
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/awards/reorder`, token, {
        entries: [
          { award_id: award.id, sort_order: other.sort_order },
          { award_id: other.id, sort_order: award.sort_order },
        ],
      });
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Reorder failed.')
          : 'Reorder failed.',
      );
    } finally {
      setActionBusy(null);
    }
  }

  async function handleEvaluate(scopeKey: string, stageId: number | null) {
    if (!slug || !token) return;
    setEvalBusy(scopeKey);
    setEvalResults((m) => {
      const next = new Map(m);
      next.delete(scopeKey);
      return next;
    });
    try {
      const result = await postJsonAuth<{ grants_created: number }>(
        `/events/${encodeURIComponent(slug)}/awards/evaluate`,
        token,
        stageId !== null ? { stage_id: stageId } : {},
      );
      setEvalResults((m) => new Map(m).set(scopeKey, result));
      setVersion((v) => v + 1);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Evaluation failed.')
          : 'Evaluation failed.',
      );
    } finally {
      setEvalBusy(null);
    }
  }

  if (loading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (loadError || !awardsData) {
    return (
      <Alert color="red" variant="light">
        {loadError ?? 'Failed to load awards.'}
      </Alert>
    );
  }

  // Build stage awards map from response + fill in any stages not yet having awards
  const stageAwardsMap = new Map<number, AwardRow[]>();
  for (const sa of awardsData.stage_awards) {
    stageAwardsMap.set(sa.stage_id, sa.awards);
  }

  return (
    <Stack gap="lg">
      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}

      {/* Event-level awards */}
      <AwardSection
        title="Event Awards"
        awards={awardsData.event_awards}
        scopeKey="event"
        stageId={null}
        onMoveUp={(a, list) => void handleReorder(a, list, 'up')}
        onMoveDown={(a, list) => void handleReorder(a, list, 'down')}
        onEdit={startEdit}
        onDelete={(id) => void handleDelete(id)}
        onEvaluate={(key, sid) => void handleEvaluate(key, sid)}
        actionBusy={actionBusy}
        evalBusy={evalBusy}
        evalResult={evalResults.get('event') ?? null}
        formContext={formContext}
        form={form}
        onFormChange={setForm}
        onFormSave={() => void handleFormSave()}
        onFormCancel={cancelForm}
        formBusy={formBusy}
        formError={formError}
        onStartAdd={startAdd}
      />

      {/* Per-stage awards */}
      {stages.length > 0 ? (
        <>
          <Divider />
          {stages.map((stage) => {
            const scopeKey = `stage-${stage.id}`;
            const stageAwards = stageAwardsMap.get(stage.id) ?? [];
            return (
              <AwardSection
                key={stage.id}
                title={`${stage.label} Awards`}
                awards={stageAwards}
                scopeKey={scopeKey}
                stageId={stage.id}
                onMoveUp={(a, list) => void handleReorder(a, list, 'up')}
                onMoveDown={(a, list) => void handleReorder(a, list, 'down')}
                onEdit={startEdit}
                onDelete={(id) => void handleDelete(id)}
                onEvaluate={(key, sid) => void handleEvaluate(key, sid)}
                actionBusy={actionBusy}
                evalBusy={evalBusy}
                evalResult={evalResults.get(scopeKey) ?? null}
                formContext={formContext}
                form={form}
                onFormChange={setForm}
                onFormSave={() => void handleFormSave()}
                onFormCancel={cancelForm}
                formBusy={formBusy}
                formError={formError}
                onStartAdd={startAdd}
              />
            );
          })}
        </>
      ) : null}
    </Stack>
  );
}
