import { useEffect, useState } from 'react';
import {
  CoreAlert as Alert,
  CoreButton as Button,
  CoreGroup as Group,
  CoreSelect,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  FormContainer,
  PageHeader,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  deleteJsonAuth,
  getJson,
  getJsonAuth,
  postJsonAuth,
  putJsonAuth,
} from '../../lib/api';

type GameSlot = {
  id: number;
  stage_id: number;
  game_index: number;
  team_size: number | null;
  variant_id: number | null;
  seed_payload: string | null;
  max_score: number | null;
};

type HanabiVariant = {
  code: number;
  name: string;
  label: string;
};

type EditState = {
  variant_id: string;
  seed_payload: string;
  max_score: string;
};

function slotKey(slot: GameSlot): string {
  return `${slot.game_index}-${slot.team_size ?? 'any'}`;
}

export function AdminGameSlotsPage() {
  const { slug, stageId } = useParams<{ slug: string; stageId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [slots, setSlots] = useState<GameSlot[]>([]);
  const [variants, setVariants] = useState<HanabiVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({
    variant_id: '',
    seed_payload: '',
    max_score: '',
  });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Add slot form
  const [addGameIndex, setAddGameIndex] = useState('');
  const [addTeamSize, setAddTeamSize] = useState('');
  const [addVariantId, setAddVariantId] = useState('');
  const [addSeedPayload, setAddSeedPayload] = useState('');
  const [addMaxScore, setAddMaxScore] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Propagation
  const [propagateBusy, setPropaggateBusy] = useState(false);
  const [propagateError, setPropagateError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!slug || !stageId || !token) return;
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setLoadError(null);
      try {
        const [slotsData, variantsData] = await Promise.all([
          getJsonAuth<GameSlot[]>(
            `/events/${encodeURIComponent(slug!)}/stages/${stageId}/games`,
            token as string,
          ),
          getJson<{ variants: HanabiVariant[] }>('/variants'),
        ]);
        if (!cancelled) {
          setSlots(slotsData);
          setVariants(variantsData.variants);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Failed to load game slots.');
          setLoading(false);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token, version]);

  const variantOptions = [
    { value: '', label: 'None' },
    ...variants.map((v) => ({ value: String(v.code), label: `${v.code} — ${v.name}` })),
  ];

  function variantLabel(variantId: number | null): string {
    if (variantId === null) return '—';
    const v = variants.find((x) => x.code === variantId);
    return v ? `${v.code} — ${v.name}` : String(variantId);
  }

  function startEdit(slot: GameSlot) {
    setEditingId(slot.id);
    setEditState({
      variant_id: slot.variant_id !== null ? String(slot.variant_id) : '',
      seed_payload: slot.seed_payload ?? '',
      max_score: slot.max_score !== null ? String(slot.max_score) : '',
    });
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(slotId: number) {
    if (!token || !slug || !stageId) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await putJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${slotId}`,
        token,
        {
          variant_id: editState.variant_id ? Number(editState.variant_id) : null,
          seed_payload: editState.seed_payload || null,
          max_score: editState.max_score ? Number(editState.max_score) : null,
        },
      );
      setEditingId(null);
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

  async function handleDelete(slotId: number) {
    if (!token || !slug || !stageId) return;
    if (!confirm('Delete this game slot? This cannot be undone.')) return;
    try {
      await deleteJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${slotId}`,
        token,
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setEditError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to delete.')
          : 'Failed to delete.',
      );
    }
  }

  async function handleAddSlot() {
    if (!token || !slug || !stageId) return;
    setAddError(null);

    const gameIndex = Number(addGameIndex);
    if (!Number.isInteger(gameIndex) || gameIndex < 0) {
      setAddError('Game index must be a non-negative integer.');
      return;
    }

    setAddBusy(true);
    try {
      await postJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/games`, token, {
        game_index: gameIndex,
        team_size: addTeamSize ? Number(addTeamSize) : null,
        variant_id: addVariantId ? Number(addVariantId) : null,
        seed_payload: addSeedPayload || null,
        max_score: addMaxScore ? Number(addMaxScore) : null,
      });
      setAddGameIndex('');
      setAddTeamSize('');
      setAddVariantId('');
      setAddSeedPayload('');
      setAddMaxScore('');
      setVersion((v) => v + 1);
    } catch (err) {
      setAddError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to add game slot.')
          : 'Failed to add game slot.',
      );
    } finally {
      setAddBusy(false);
    }
  }

  async function handlePropagate(overrideExisting: boolean) {
    if (!token || !slug || !stageId) return;
    setPropaggateBusy(true);
    setPropagateError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/propagate`,
        token,
        { override_existing: overrideExisting },
      );
      setVersion((v) => v + 1);
    } catch (err) {
      setPropagateError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Propagation failed.')
          : 'Propagation failed.',
      );
    } finally {
      setPropaggateBusy(false);
    }
  }

  // Propagation warnings
  const slotsWithVariant = slots.filter((s) => s.variant_id !== null).length;
  const slotsWithSeed = slots.filter((s) => s.seed_payload !== null).length;

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

  const hasPerTrack = slots.some((s) => s.team_size !== null);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <PageHeader title="Game Slots" level={3} />
        <Button
          variant="default"
          size="sm"
          onClick={() => navigate(`/admin/events/${slug}/stages`)}
        >
          ← Back to Stages
        </Button>
      </Group>

      {editError ? (
        <Alert color="red" variant="light">
          {editError}
        </Alert>
      ) : null}

      {/* Slots table */}
      {slots.length === 0 ? (
        <Text c="dimmed" size="sm">
          No game slots yet. Add one below or use propagation to fill from stage/event defaults.
        </Text>
      ) : (
        <SectionCard>
          <Stack gap="xs">
            {/* Header */}
            <Group
              gap={0}
              style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', paddingBottom: 8 }}
            >
              <Text size="xs" fw={600} style={{ width: 80 }}>
                Game #
              </Text>
              {hasPerTrack ? (
                <Text size="xs" fw={600} style={{ width: 70 }}>
                  Team size
                </Text>
              ) : null}
              <Text size="xs" fw={600} style={{ flex: 1 }}>
                Variant
              </Text>
              <Text size="xs" fw={600} style={{ flex: 1 }}>
                Seed
              </Text>
              <Text size="xs" fw={600} style={{ width: 90 }}>
                Max score
              </Text>
              <Text size="xs" fw={600} style={{ width: 130 }}>
                Actions
              </Text>
            </Group>

            {slots.map((slot) => {
              const isEditing = editingId === slot.id;
              return (
                <Group key={slotKey(slot)} gap={0} align="center">
                  <Text size="sm" style={{ width: 80 }}>
                    {slot.game_index}
                  </Text>
                  {hasPerTrack ? (
                    <Text size="sm" style={{ width: 70 }}>
                      {slot.team_size ?? '—'}
                    </Text>
                  ) : null}

                  {isEditing ? (
                    <>
                      <div style={{ flex: 1, paddingRight: 8 }}>
                        <CoreSelect
                          value={editState.variant_id}
                          onChange={(v) => setEditState((s) => ({ ...s, variant_id: v ?? '' }))}
                          data={variantOptions}
                          size="xs"
                        />
                      </div>
                      <div style={{ flex: 1, paddingRight: 8 }}>
                        <TextInput
                          value={editState.seed_payload}
                          onChange={(e) =>
                            setEditState((s) => ({ ...s, seed_payload: e.currentTarget.value }))
                          }
                          placeholder="seed"
                          size="xs"
                        />
                      </div>
                      <div style={{ width: 90, paddingRight: 8 }}>
                        <TextInput
                          value={editState.max_score}
                          onChange={(e) =>
                            setEditState((s) => ({
                              ...s,
                              max_score: e.currentTarget.value.replace(/\D/g, ''),
                            }))
                          }
                          placeholder="—"
                          size="xs"
                        />
                      </div>
                      <Group gap={4} style={{ width: 130 }}>
                        <Button size="xs" loading={editBusy} onClick={() => void saveEdit(slot.id)}>
                          Save
                        </Button>
                        <Button size="xs" variant="default" onClick={cancelEdit}>
                          Cancel
                        </Button>
                      </Group>
                    </>
                  ) : (
                    <>
                      <Text
                        size="sm"
                        c={slot.variant_id === null ? 'dimmed' : undefined}
                        style={{ flex: 1 }}
                      >
                        {variantLabel(slot.variant_id)}
                      </Text>
                      <Text
                        size="sm"
                        c={slot.seed_payload === null ? 'dimmed' : undefined}
                        style={{ flex: 1 }}
                      >
                        {slot.seed_payload ?? '—'}
                      </Text>
                      <Text
                        size="sm"
                        c={slot.max_score === null ? 'dimmed' : undefined}
                        style={{ width: 90 }}
                      >
                        {slot.max_score ?? '—'}
                      </Text>
                      <Group gap={4} style={{ width: 130 }}>
                        <Button
                          size="xs"
                          variant="default"
                          disabled={editingId !== null}
                          onClick={() => startEdit(slot)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="xs"
                          variant="outline"
                          color="red"
                          disabled={editingId !== null}
                          onClick={() => void handleDelete(slot.id)}
                        >
                          Del
                        </Button>
                      </Group>
                    </>
                  )}
                </Group>
              );
            })}
          </Stack>
        </SectionCard>
      )}

      {/* Add game slot */}
      <SectionCard>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Add Game Slot
          </Text>

          {addError ? (
            <Alert color="red" variant="light">
              {addError}
            </Alert>
          ) : null}

          <FormContainer>
            <Group grow>
              <TextInput
                label="Game Index"
                placeholder="0"
                value={addGameIndex}
                onChange={(e) => setAddGameIndex(e.currentTarget.value.replace(/\D/g, ''))}
                required
              />
              <TextInput
                label="Team Size (optional)"
                placeholder="e.g. 2"
                value={addTeamSize}
                onChange={(e) => setAddTeamSize(e.currentTarget.value.replace(/\D/g, ''))}
              />
            </Group>
            <Group grow>
              <CoreSelect
                label="Variant (optional)"
                value={addVariantId}
                onChange={(v) => setAddVariantId(v ?? '')}
                data={variantOptions}
              />
              <TextInput
                label="Seed Payload (optional)"
                placeholder="e.g. e1s1g0"
                value={addSeedPayload}
                onChange={(e) => setAddSeedPayload(e.currentTarget.value)}
              />
              <TextInput
                label="Max Score (optional)"
                placeholder="e.g. 30"
                value={addMaxScore}
                onChange={(e) => setAddMaxScore(e.currentTarget.value.replace(/\D/g, ''))}
              />
            </Group>
            <Group justify="flex-end">
              <Button size="sm" loading={addBusy} onClick={() => void handleAddSlot()}>
                Add Slot
              </Button>
            </Group>
          </FormContainer>
        </Stack>
      </SectionCard>

      {/* Propagation */}
      <SectionCard>
        <Stack gap="sm">
          <Text fw={600} size="sm">
            Propagate from Stage / Event Defaults
          </Text>
          <Text size="sm" c="dimmed">
            Applies variant and seed rules from stage or event defaults to all game slots. Slots
            with existing values are skipped unless you choose to override.
          </Text>

          {propagateError ? (
            <Alert color="red" variant="light">
              {propagateError}
            </Alert>
          ) : null}

          {(slotsWithVariant > 0 || slotsWithSeed > 0) && (
            <Alert color="yellow" variant="light">
              {slotsWithVariant > 0
                ? `${slotsWithVariant} slot${slotsWithVariant === 1 ? ' has' : 's have'} a variant set. `
                : ''}
              {slotsWithSeed > 0
                ? `${slotsWithSeed} slot${slotsWithSeed === 1 ? ' has' : 's have'} a seed payload set. `
                : ''}
              These will be skipped with "Fill empty only", or overwritten with "Override all".
            </Alert>
          )}

          <Group gap="sm">
            <Button
              size="sm"
              variant="light"
              loading={propagateBusy}
              onClick={() => void handlePropagate(false)}
            >
              Fill empty only
            </Button>
            <Button
              size="sm"
              variant="light"
              color="orange"
              loading={propagateBusy}
              onClick={() => void handlePropagate(true)}
            >
              Override all
            </Button>
          </Group>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
