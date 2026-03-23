import { useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CoreActionIcon,
  CoreAlert as Alert,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreSelect,
  CoreModal,
  CoreSkeleton as Skeleton,
  CoreStack as Stack,
  CoreSwitch as Switch,
  CoreText as Text,
  CoreTextInput as TextInput,
  CoreTooltip as Tooltip,
  FormContainer,
  Heading,
  Inline,
  MaterialIcon,
  Pagination,
  SectionCard,
} from '../../design-system';
import { useParams, useNavigate } from 'react-router-dom';
import { useStages } from '../../hooks/useStages';
import { useSimulationMode } from '../../hooks/useSimulation';
import { SimulateStageButton, SimulateEventButton } from '../../features/admin/components';
import { useEvents } from '../../hooks/useEvents';
import { useStageGroups, type StageGroup, type GroupTemplate } from '../../hooks/useStageGroups';
import {
  useStageTransitions,
  type FilterType,
  type SeedingMethod,
  type StageTransition,
} from '../../hooks/useStageTransitions';
import { useVariants, variantSelectOptions, type HanabiVariant } from '../../hooks/useVariants';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  deleteJsonAuth,
  getJsonAuth,
  patchJsonAuth,
  postJsonAuth,
  putJsonAuth,
} from '../../lib/api';
import type { StageSummary } from '../../hooks/useStages';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ---------------------------------------------------------------------------
// Custom collision detection
// ---------------------------------------------------------------------------
// For ledger-level drags (ungrouped stages or groups), exclude group-internal
// droppables so the dragged item collides with the group's own sortable node
// (g-{id}) rather than landing inside the group unintentionally.
const ledgerCollisionDetection: CollisionDetection = (args) => {
  const dragData = args.active.data.current as
    | { type: 'stage'; groupId: number | null }
    | { type: 'group' }
    | undefined;

  const isLedgerDrag =
    dragData?.type === 'group' || (dragData?.type === 'stage' && dragData.groupId === null);

  if (isLedgerDrag) {
    const filtered = args.droppableContainers.filter((c) => {
      const cData = c.data?.current as { type?: string; groupId?: number | null } | undefined;
      // Exclude group-internal DroppableEmptySlot (ids like 'group-123')
      if (/^group-\d+$/.test(String(c.id))) return false;
      // Exclude sortable stage nodes that belong to a group
      if (cData?.type === 'stage' && cData.groupId != null) return false;
      return true;
    });
    return closestCenter({ ...args, droppableContainers: filtered });
  }

  return closestCenter(args);
};

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

function mechanismColor(mechanism: string): string {
  switch (mechanism) {
    case 'SEEDED_LEADERBOARD':
      return 'teal';
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
      return 'Challenge';
    case 'GAUNTLET':
      return 'Gauntlet';
    case 'MATCH_PLAY':
      return 'Match Play';
    default:
      return mechanism;
  }
}

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: 'ALL', label: 'All teams' },
  { value: 'TOP_N', label: 'Top N' },
  { value: 'THRESHOLD', label: 'Threshold' },
  { value: 'MANUAL', label: 'Manual' },
];

const SEEDING_METHODS: { value: SeedingMethod; label: string }[] = [
  { value: 'PRESERVE', label: 'Preserve order' },
  { value: 'RANKED', label: 'Ranked' },
  { value: 'RANDOM', label: 'Random' },
  { value: 'MANUAL', label: 'Manual' },
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function resolvePreviewLabel(pattern: string | undefined, n: number): string {
  if (!pattern) return `Stage ${n}`;
  return pattern.replace(/\{n\}/g, String(n));
}

function transitionSummary(t: StageTransition): string {
  const parts: string[] = [];
  if (t.filter_type === 'TOP_N') parts.push(`Top ${t.filter_value ?? '?'}`);
  else if (t.filter_type === 'THRESHOLD') parts.push(`Score ≥ ${t.filter_value ?? '?'}`);
  else if (t.filter_type === 'MANUAL') parts.push('Manual filter');
  if (t.seeding_method !== 'PRESERVE') {
    parts.push(t.seeding_method.charAt(0) + t.seeding_method.slice(1).toLowerCase() + ' seed');
  }
  return parts.length > 0 ? parts.join(' · ') : 'Passthrough';
}

// ---------------------------------------------------------------------------
// Game Slots
// ---------------------------------------------------------------------------

type GameSlot = {
  id: number;
  stage_id: number;
  game_index: number;
  nickname: string | null;
  variant_id: number | null;
  seed_payload: string | null;
  result_count: number;
  effective_variant_id: number;
  effective_max_score: number;
  effective_seed: string | null;
  created_at: string;
};

function variantName(variants: HanabiVariant[], id: number): string {
  if (id === 0) return 'No Variant';
  return variants.find((v) => v.code === id)?.name ?? `Variant ${id}`;
}

// ---------------------------------------------------------------------------
// GameSlotCard — one slot row with local edit state and up/down reorder
// ---------------------------------------------------------------------------

function GameSlotCard({
  slot,
  variants,
  variantInheritOptions,
  slug,
  stageId,
  onUpdate,
  onDelete,
  onReorder,
}: {
  slot: GameSlot;
  variants: HanabiVariant[];
  variantInheritOptions: { value: string; label: string }[];
  slug: string;
  stageId: number;
  onUpdate: (updated: GameSlot) => void;
  onDelete: (id: number) => void;
  onReorder: () => Promise<void>;
}) {
  const { token } = useAuth();
  const locked = slot.result_count > 0;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(slot.id),
    disabled: locked,
  });

  const [editing, setEditing] = useState(false);
  const [editSeed, setEditSeed] = useState('');
  const [editVariant, setEditVariant] = useState('');
  const [editNickname, setEditNickname] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [indexEditing, setIndexEditing] = useState(false);
  const [indexHovered, setIndexHovered] = useState(false);
  const [indexValue, setIndexValue] = useState('');
  const [indexBusy, setIndexBusy] = useState(false);

  async function saveIndex() {
    const parsed = parseInt(indexValue, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed - 1 === slot.game_index) {
      setIndexEditing(false);
      return;
    }
    if (!token) return;
    setIndexBusy(true);
    try {
      await patchJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${slot.id}/reorder`,
        token,
        { game_index: parsed - 1 },
      );
      await onReorder();
    } catch {
      // silently revert
    } finally {
      setIndexBusy(false);
      setIndexEditing(false);
    }
  }

  function openEdit() {
    setEditSeed(slot.seed_payload ?? '');
    setEditVariant(slot.variant_id !== null ? String(slot.variant_id) : '');
    setEditNickname(slot.nickname ?? '');
    setEditError(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!token) return;
    setEditBusy(true);
    setEditError(null);
    try {
      const updated = await putJsonAuth<GameSlot>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${slot.id}`,
        token,
        {
          variant_id: editVariant === '' ? null : parseInt(editVariant, 10),
          seed_payload: editSeed.trim() || null,
          nickname: editNickname.trim() || null,
        },
      );
      onUpdate(updated);
      setEditing(false);
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

  async function handleDelete() {
    if (!token) return;
    if (!confirm('Delete this game slot? This cannot be undone.')) return;
    try {
      await deleteJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${slot.id}`,
        token,
      );
      onDelete(slot.id);
    } catch (err) {
      setEditError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Delete failed.')
          : 'Delete failed.',
      );
    }
  }

  return (
    <Card
      variant="outline"
      padding="sm"
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      <Stack gap="xs">
        <Inline justify="space-between" align="center" wrap={false}>
          <Inline gap="sm" align="center" wrap={false} style={{ minWidth: 0 }}>
            {indexEditing ? (
              <TextInput
                value={indexValue}
                onChange={(e) => setIndexValue(e.currentTarget.value.replace(/\D/g, ''))}
                onBlur={() => void saveIndex()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveIndex();
                  if (e.key === 'Escape') setIndexEditing(false);
                }}
                size="xs"
                style={{ width: 44, flexShrink: 0 }}
                autoFocus
                disabled={indexBusy}
              />
            ) : (
              <Text
                size="sm"
                fw={600}
                style={{
                  cursor: 'pointer',
                  flexShrink: 0,
                  minWidth: 24,
                  textAlign: 'center',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: indexHovered
                    ? 'var(--mantine-color-gray-2)'
                    : 'var(--mantine-color-gray-1)',
                  transition: 'background 120ms ease',
                  userSelect: 'none',
                }}
                onMouseEnter={() => setIndexHovered(true)}
                onMouseLeave={() => setIndexHovered(false)}
                onClick={() => {
                  setIndexValue(String(slot.game_index + 1));
                  setIndexEditing(true);
                }}
              >
                {slot.game_index + 1}
              </Text>
            )}
            <span
              {...attributes}
              {...listeners}
              style={{
                cursor: locked ? 'default' : 'grab',
                userSelect: 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--ds-color-text-muted)',
              }}
              aria-label="Drag to reorder"
            >
              <MaterialIcon name="drag_indicator" size={16} />
            </span>
            <Stack gap={2} style={{ minWidth: 0 }}>
              <Text size="sm" fw={600}>
                Game {slot.game_index + 1}
                {slot.nickname ? (
                  <Text span size="xs" c="dimmed">
                    {` · ${slot.nickname}`}
                  </Text>
                ) : null}
                {locked ? (
                  <Text span size="xs" c="dimmed">
                    {' · locked'}
                  </Text>
                ) : null}
              </Text>
              <Text size="xs" c="dimmed">
                {variantName(variants, slot.effective_variant_id)}
                {slot.variant_id === null ? (
                  <Text span size="xs" c="dimmed" fs="italic">
                    {' (inherited)'}
                  </Text>
                ) : null}
                {' · '}
                {slot.seed_payload === null ? (
                  slot.effective_seed ? (
                    <>
                      {slot.effective_seed}
                      <Text span size="xs" c="dimmed" fs="italic">
                        {' (inherited)'}
                      </Text>
                    </>
                  ) : (
                    'No seed'
                  )
                ) : (
                  (slot.effective_seed ?? slot.seed_payload)
                )}
              </Text>
            </Stack>
          </Inline>

          <Inline gap={4} wrap={false} style={{ flexShrink: 0 }}>
            <CoreActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              title={editing ? 'Cancel' : 'Edit'}
              onClick={() => {
                if (editing) {
                  setEditing(false);
                } else {
                  openEdit();
                }
              }}
            >
              <MaterialIcon name={editing ? 'close' : 'edit'} size={14} />
            </CoreActionIcon>
            <Tooltip label="Has results — cannot delete" disabled={!locked}>
              <CoreActionIcon
                variant="subtle"
                color="red"
                size="sm"
                disabled={locked}
                onClick={() => void handleDelete()}
              >
                <MaterialIcon name="delete" size={14} />
              </CoreActionIcon>
            </Tooltip>
          </Inline>
        </Inline>

        {editing && (
          <FormContainer>
            {editError ? (
              <Alert color="red" variant="light">
                {editError}
              </Alert>
            ) : null}
            <Group grow>
              <TextInput
                label="Seed payload"
                placeholder="e.g. e{eID}s{sID}g{gID} — leave empty to inherit"
                value={editSeed}
                onChange={(e) => setEditSeed(e.currentTarget.value)}
                size="sm"
              />
              <CoreSelect
                label="Variant"
                value={editVariant}
                onChange={(v) => setEditVariant(v ?? '')}
                data={variantInheritOptions}
                size="sm"
              />
              <TextInput
                label="Nickname (dev only)"
                placeholder="e.g. 'Hard game' — optional"
                value={editNickname}
                onChange={(e) => setEditNickname(e.currentTarget.value)}
                size="sm"
              />
            </Group>
            <Group justify="flex-end" gap="xs">
              <Button size="xs" variant="default" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="xs" loading={editBusy} onClick={() => void saveEdit()}>
                Save
              </Button>
            </Group>
          </FormContainer>
        )}
      </Stack>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// GameSlotsSection — expandable slot manager inside a stage card
// ---------------------------------------------------------------------------

function GameSlotsSection({
  slug,
  stageId,
  variants,
}: {
  slug: string;
  stageId: number;
  variants: HanabiVariant[];
}) {
  const { token } = useAuth();

  const [slots, setSlots] = useState<GameSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Add N modal state
  const [addNOpen, setAddNOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getJsonAuth<GameSlot[]>(
          `/events/${encodeURIComponent(slug)}/stages/${stageId}/games`,
          token as string,
        );
        if (!cancelled) setSlots(data);
      } catch {
        if (!cancelled) setLoadError('Failed to load game slots.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug, stageId, token]);

  async function reloadSlots() {
    if (!token) return;
    try {
      const data = await getJsonAuth<GameSlot[]>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games`,
        token,
      );
      setSlots(data);
    } catch {
      /* keep existing data */
    }
  }

  async function handleAddOne() {
    if (!token) return;
    setActionError(null);
    try {
      const created = await postJsonAuth<GameSlot>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games`,
        token,
        {},
      );
      setSlots((prev) => [...prev, created].sort((a, b) => a.game_index - b.game_index));
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to add game.')
          : 'Failed to add game.',
      );
    }
  }

  async function handleBulkAdd() {
    if (!token) return;
    const count = parseInt(bulkCount, 10);
    if (!Number.isFinite(count) || count < 1 || count > 100) {
      setBulkError('Count must be between 1 and 100.');
      return;
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const created = await postJsonAuth<GameSlot[]>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/bulk`,
        token,
        { count },
      );
      setSlots((prev) => [...prev, ...created].sort((a, b) => a.game_index - b.game_index));
      setBulkCount('');
      setAddNOpen(false);
    } catch (err) {
      setBulkError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Bulk add failed.')
          : 'Bulk add failed.',
      );
    } finally {
      setBulkBusy(false);
    }
  }

  const slotSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  async function handleSlotDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !token) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);
    const oldIdx = slots.findIndex((s) => s.id === activeId);
    const newIdx = slots.findIndex((s) => s.id === overId);
    if (oldIdx === -1 || newIdx === -1) return;

    const targetGameIndex = slots[newIdx].game_index;
    setSlots((prev) => arrayMove(prev, oldIdx, newIdx));
    setActionError(null);
    try {
      await patchJsonAuth(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/games/${activeId}/reorder`,
        token,
        { game_index: targetGameIndex },
      );
      await reloadSlots();
    } catch {
      setActionError('Failed to reorder game.');
      await reloadSlots();
    }
  }

  const variantInheritOptions = [
    { value: '', label: 'Inherit from stage/event' },
    { value: '0', label: 'No Variant' },
    ...variantSelectOptions(variants).filter((o) => o.value !== '' && o.value !== '0'),
  ];

  return (
    <Stack gap="sm">
      {/* Toolbar */}
      <Inline justify="space-between" align="center">
        <Inline gap="xs">
          <Button size="xs" variant="default" onClick={() => void handleAddOne()}>
            + Add Game
          </Button>
          <Button
            size="xs"
            variant="default"
            onClick={() => {
              setBulkCount('');
              setBulkError(null);
              setAddNOpen(true);
            }}
          >
            + Add N Games
          </Button>
        </Inline>
        <Text size="xs" c="dimmed">
          {slots.length} game{slots.length === 1 ? '' : 's'}
        </Text>
      </Inline>

      {actionError ? (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      ) : null}
      {loadError ? (
        <Alert color="red" variant="light">
          {loadError}
        </Alert>
      ) : null}

      {/* Slot list */}
      {loading ? (
        <Stack gap="xs">
          <Skeleton height={48} />
          <Skeleton height={48} />
        </Stack>
      ) : slots.length === 0 ? (
        <Text c="dimmed" size="sm">
          No game slots yet.
        </Text>
      ) : (
        <Stack gap="sm">
          <DndContext
            sensors={slotSensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => void handleSlotDragEnd(e)}
          >
            <SortableContext
              items={slots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((s) => String(s.id))}
              strategy={verticalListSortingStrategy}
            >
              <Stack gap="xs">
                {slots.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((slot) => (
                  <GameSlotCard
                    key={slot.id}
                    slot={slot}
                    variants={variants}
                    variantInheritOptions={variantInheritOptions}
                    slug={slug}
                    stageId={stageId}
                    onUpdate={(updated) =>
                      setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                    }
                    onReorder={reloadSlots}
                    onDelete={(id) => {
                      const next = slots.filter((s) => s.id !== id);
                      setSlots(next);
                      const maxPage = Math.max(1, Math.ceil(next.length / PAGE_SIZE));
                      if (page > maxPage) setPage(maxPage);
                    }}
                  />
                ))}
              </Stack>
            </SortableContext>
          </DndContext>
          {slots.length > PAGE_SIZE && (
            <Pagination
              totalItems={slots.length}
              pageSize={PAGE_SIZE}
              currentPage={page}
              onPageChange={setPage}
            />
          )}
        </Stack>
      )}

      {/* Add N modal */}
      <CoreModal opened={addNOpen} onClose={() => setAddNOpen(false)} title="Add N Games" size="sm">
        <Stack gap="sm">
          {bulkError ? (
            <Alert color="red" variant="light">
              {bulkError}
            </Alert>
          ) : null}
          <FormContainer>
            <TextInput
              label="Number of games"
              placeholder="e.g. 5"
              value={bulkCount}
              onChange={(e) => setBulkCount(e.currentTarget.value.replace(/\D/g, ''))}
              autoFocus
            />
            <Group justify="flex-end" gap="xs">
              <Button variant="default" onClick={() => setAddNOpen(false)} disabled={bulkBusy}>
                Cancel
              </Button>
              <Button loading={bulkBusy} onClick={() => void handleBulkAdd()}>
                Add Games
              </Button>
            </Group>
          </FormContainer>
        </Stack>
      </CoreModal>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// DroppableEmptySlot
// ---------------------------------------------------------------------------

function DroppableEmptySlot({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({
    id,
    data: { type: 'container', containerId: id },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        border: `2px dashed ${isOver ? 'var(--mantine-color-teal-4)' : 'var(--mantine-color-gray-4)'}`,
        borderRadius: 6,
        padding: '12px 16px',
        textAlign: 'center',
        color: isOver ? 'var(--mantine-color-teal-6)' : 'var(--mantine-color-dimmed)',
        fontSize: 'var(--mantine-font-size-xs)',
        background: isOver ? 'var(--mantine-color-teal-0)' : undefined,
        transition: 'all 0.15s ease',
      }}
    >
      Drop stage here
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger sentinel drop zones (move to first / last position)
// ---------------------------------------------------------------------------

const LEDGER_SENTINEL_START = 'ledger_sentinel_start';
const LEDGER_SENTINEL_END = 'ledger_sentinel_end';

function LedgerSentinelZone({ id }: { id: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        height: isOver ? 4 : 8,
        background: isOver ? 'var(--mantine-color-blue-4)' : 'transparent',
        borderRadius: 2,
        transition: 'background 0.15s, height 0.1s',
        flexShrink: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// StageCardContent — shared between SortableStageCard and DragOverlay
// ---------------------------------------------------------------------------

function StageCardContent({
  stage,
  dragHandleProps,
  dndRef,
  dndStyle,
  onClone,
  onDelete,
  onToggleVisible,
  onNavigate,
  busy,
  overlay,
  expanded,
  onToggleExpand,
  variants,
  simulationMode,
}: {
  stage: StageSummary;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  dndRef?: React.RefCallback<HTMLElement>;
  dndStyle?: React.CSSProperties;
  onClone: (stageId: number) => void;
  onDelete: (stageId: number) => void;
  onToggleVisible: (stageId: number) => void;
  onNavigate: (path: string) => void;
  busy: number | null;
  overlay?: boolean;
  expanded?: boolean;
  onToggleExpand?: (stageId: number) => void;
  variants?: HanabiVariant[];
  simulationMode?: boolean;
}) {
  const { slug } = useParams<{ slug: string }>();
  const hasSlots = stage.mechanism !== 'MATCH_PLAY';

  return (
    <Card
      variant="elevated"
      padding="none"
      ref={dndRef}
      style={{
        border: '1px solid var(--mantine-color-gray-3)',
        background: 'var(--mantine-color-white)',
        opacity: overlay ? 0.85 : 1,
        boxShadow: overlay ? '0 4px 16px rgba(0,0,0,0.18)' : undefined,
        ...dndStyle,
      }}
    >
      <CardBody>
        <Inline justify="space-between" align="center" wrap={false}>
          <Inline gap="sm" align="center" wrap={false} style={{ flex: 1, minWidth: 0 }}>
            {/* Drag handle */}
            <span
              {...dragHandleProps}
              style={{
                cursor: dragHandleProps ? 'grab' : 'default',
                userSelect: 'none',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                color: 'var(--ds-color-text-muted)',
                ...(dragHandleProps?.style ?? {}),
              }}
              aria-label="Drag to reorder"
            >
              <MaterialIcon name="drag_indicator" size={20} />
            </span>

            {/* Stage info */}
            <Stack gap={4} style={{ minWidth: 0 }}>
              <Heading level={4}>{stage.label}</Heading>
              <Inline gap="xs" align="center">
                <Badge color={mechanismColor(stage.mechanism)} variant="light" size="sm">
                  {mechanismLabel(stage.mechanism)}
                </Badge>
                <Badge variant="light" size="sm">
                  {stage.status}
                </Badge>
                <Text size="sm" c="dimmed">
                  {stage.game_slot_count} game slot{stage.game_slot_count === 1 ? '' : 's'} ·{' '}
                  {stage.team_count} team{stage.team_count === 1 ? '' : 's'}
                </Text>
              </Inline>
            </Stack>
          </Inline>

          {/* Action icon buttons */}
          <Inline gap="xs" wrap={false} style={{ flexShrink: 0 }}>
            {simulationMode && slug && !overlay ? (
              <SimulateStageButton stage={stage} eventSlug={slug} />
            ) : null}
            {stage.participation_type === 'INDIVIDUAL' ? (
              <CoreActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Draw"
                onClick={() => onNavigate(`/admin/events/${slug}/stages/${stage.id}/draw`)}
              >
                <MaterialIcon name="shuffle" size={16} />
              </CoreActionIcon>
            ) : null}
            {stage.mechanism === 'MATCH_PLAY' ? (
              <CoreActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Bracket"
                onClick={() => onNavigate(`/admin/events/${slug}/stages/${stage.id}/bracket`)}
              >
                <MaterialIcon name="account_tree" size={16} />
              </CoreActionIcon>
            ) : null}
            {hasSlots && onToggleExpand && !overlay ? (
              <CoreActionIcon
                variant={expanded ? 'light' : 'subtle'}
                color={expanded ? 'blue' : 'gray'}
                size="sm"
                title={expanded ? 'Hide game slots' : 'Manage game slots'}
                onClick={() => onToggleExpand(stage.id)}
              >
                <MaterialIcon name="casino" size={16} />
              </CoreActionIcon>
            ) : null}
            <CoreActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              title="Clone"
              disabled={busy === stage.id}
              onClick={() => onClone(stage.id)}
            >
              <MaterialIcon name="content_copy" size={16} />
            </CoreActionIcon>
            <CoreActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              title="Edit"
              onClick={() => onNavigate(`/admin/events/${slug}/stages/${stage.id}/edit`)}
            >
              <MaterialIcon name="edit" size={16} />
            </CoreActionIcon>
            <CoreActionIcon
              variant="subtle"
              color={stage.visible ? 'gray' : 'orange'}
              size="sm"
              title={stage.visible ? 'Hide stage' : 'Show stage'}
              disabled={busy === stage.id}
              onClick={() => onToggleVisible(stage.id)}
            >
              <MaterialIcon name={stage.visible ? 'visibility' : 'visibility_off'} size={16} />
            </CoreActionIcon>
            <CoreActionIcon
              variant="subtle"
              color="red"
              size="sm"
              title="Delete"
              disabled={busy === stage.id}
              onClick={() => onDelete(stage.id)}
            >
              <MaterialIcon name="delete" size={16} />
            </CoreActionIcon>
          </Inline>
        </Inline>
      </CardBody>

      {expanded && !overlay && slug && variants ? (
        <CardBody style={{ borderTop: '1px solid var(--mantine-color-gray-3)' }}>
          <GameSlotsSection slug={slug} stageId={stage.id} variants={variants} />
        </CardBody>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// SortableStageCard — wraps StageCardContent with useSortable
// ---------------------------------------------------------------------------

function SortableStageCard({
  stage,
  onClone,
  onDelete,
  onToggleVisible,
  onNavigate,
  busy,
  variants,
  simulationMode,
}: {
  stage: StageSummary;
  onClone: (stageId: number) => void;
  onDelete: (stageId: number) => void;
  onToggleVisible: (stageId: number) => void;
  onNavigate: (path: string) => void;
  busy: number | null;
  variants: HanabiVariant[];
  simulationMode?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(stage.id),
    data: { type: 'stage', stageId: stage.id, groupId: stage.group_id ?? null },
  });

  return (
    <StageCardContent
      stage={stage}
      dragHandleProps={{ ...attributes, ...listeners }}
      dndRef={setNodeRef}
      dndStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : 1,
      }}
      onClone={onClone}
      onDelete={onDelete}
      onToggleVisible={onToggleVisible}
      onNavigate={onNavigate}
      busy={busy}
      expanded={expanded}
      onToggleExpand={() => setExpanded((e) => !e)}
      variants={variants}
      simulationMode={simulationMode}
    />
  );
}

// ---------------------------------------------------------------------------
// GroupTemplateModal
// ---------------------------------------------------------------------------

const MECHANISM_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'SEEDED_LEADERBOARD', label: 'Challenge' },
  { value: 'GAUNTLET', label: 'Gauntlet' },
  { value: 'MATCH_PLAY', label: 'Match Play' },
];
const TIME_POLICY_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'WINDOW', label: 'Batch (all games open simultaneously)' },
  { value: 'ROLLING', label: 'Sequential (games unlock in order)' },
  { value: 'SCHEDULED', label: 'Custom Schedule (individual times per game)' },
];
const PARTICIPATION_TYPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'TEAM', label: 'Team' },
  { value: 'INDIVIDUAL', label: 'Individual' },
];
const TEAM_SCOPE_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'EVENT', label: 'Event' },
  { value: 'STAGE', label: 'Stage' },
];
const ATTEMPT_POLICY_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'SINGLE', label: 'Single' },
  { value: 'REQUIRED_ALL', label: 'Required All' },
  { value: 'BEST_OF_N', label: 'Best of N' },
  { value: 'UNLIMITED_BEST', label: 'Unlimited Best' },
];

function GroupTemplateModal({
  group,
  slug,
  token,
  variants,
  onSave,
  onClose,
}: {
  group: StageGroup;
  slug: string | undefined;
  token: string | null;
  variants: HanabiVariant[];
  onSave: (updated: StageGroup) => void;
  onClose: () => void;
}) {
  const tpl = group.template_json ?? ({} as GroupTemplate);
  const [labelPattern, setLabelPattern] = useState(tpl.label_pattern ?? '');
  const [mechanism, setMechanism] = useState(tpl.mechanism ?? '');
  const [participationType, setParticipationType] = useState(tpl.participation_type ?? '');
  const [teamScope, setTeamScope] = useState(tpl.team_scope ?? '');
  const [attemptPolicy, setAttemptPolicy] = useState(tpl.attempt_policy ?? '');
  const [timePolicy, setTimePolicy] = useState(tpl.time_policy ?? '');
  const [gameCount, setGameCount] = useState(tpl.game_count != null ? String(tpl.game_count) : '');
  const [variantCode, setVariantCode] = useState<string>(() => {
    if (!tpl.variant_rule_json) return '';
    if (tpl.variant_rule_json.type === 'none') return '0';
    if (tpl.variant_rule_json.type === 'specific') return String(tpl.variant_rule_json.variantId);
    return '';
  });
  const [seedFormula, setSeedFormula] = useState(tpl.seed_rule_json?.formula ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const templateVariantOptions = [
    { value: '', label: 'Not specified' },
    { value: '0', label: 'No Variant' },
    ...variantSelectOptions(variants).filter((o) => o.value !== '' && o.value !== '0'),
  ];

  async function handleSave(clear = false) {
    if (!token || !slug) return;
    setBusy(true);
    setError(null);
    try {
      let templateJson: GroupTemplate | null = null;
      if (!clear) {
        const t: GroupTemplate = {};
        if (labelPattern.trim()) t.label_pattern = labelPattern.trim();
        if (mechanism) t.mechanism = mechanism;
        if (participationType) t.participation_type = participationType;
        if (teamScope) t.team_scope = teamScope;
        if (attemptPolicy) t.attempt_policy = attemptPolicy;
        if (timePolicy) t.time_policy = timePolicy;
        const gc = parseInt(gameCount, 10);
        if (Number.isFinite(gc) && gc > 0) t.game_count = gc;
        if (variantCode === '0') {
          t.variant_rule_json = { type: 'none' };
        } else if (variantCode) {
          t.variant_rule_json = { type: 'specific', variantId: parseInt(variantCode, 10) };
        }
        if (seedFormula.trim()) t.seed_rule_json = { formula: seedFormula.trim() };
        templateJson = Object.keys(t).length > 0 ? t : null;
      }
      const updated = await putJsonAuth<StageGroup>(
        `/events/${encodeURIComponent(slug)}/stage-groups/${group.id}`,
        token,
        { template_json: templateJson },
      );
      onSave(updated);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to save template.')
          : 'Failed to save template.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <CoreModal opened onClose={onClose} title={`Stage Template — ${group.label}`} size="lg">
      <Stack gap="sm">
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}
        <FormContainer>
          <Group grow>
            <TextInput
              label="Label pattern"
              placeholder="e.g. Week {n}"
              description="{n} = 1-based position within group"
              value={labelPattern}
              onChange={(e) => setLabelPattern(e.currentTarget.value)}
            />
            <TextInput
              label="Games per stage"
              placeholder="e.g. 4"
              value={gameCount}
              onChange={(e) => setGameCount(e.currentTarget.value.replace(/\D/g, ''))}
            />
          </Group>
          <Group grow>
            <CoreSelect
              label="Mechanism"
              value={mechanism}
              onChange={(v) => setMechanism(v ?? '')}
              data={MECHANISM_OPTIONS}
            />
            <CoreSelect
              label="Time policy"
              value={timePolicy}
              onChange={(v) => setTimePolicy(v ?? '')}
              data={TIME_POLICY_OPTIONS}
            />
          </Group>
          <Group grow>
            <CoreSelect
              label="Participation"
              value={participationType}
              onChange={(v) => setParticipationType(v ?? '')}
              data={PARTICIPATION_TYPE_OPTIONS}
            />
            <CoreSelect
              label="Team scope"
              value={teamScope}
              onChange={(v) => setTeamScope(v ?? '')}
              data={TEAM_SCOPE_OPTIONS}
            />
            <CoreSelect
              label="Attempt policy"
              value={attemptPolicy}
              onChange={(v) => setAttemptPolicy(v ?? '')}
              data={ATTEMPT_POLICY_OPTIONS}
            />
          </Group>
          <Group grow>
            <CoreSelect
              label="Variant"
              value={variantCode}
              onChange={(v) => setVariantCode(v ?? '')}
              data={templateVariantOptions}
              searchable
            />
            <TextInput
              label="Seed formula"
              placeholder="e.g. e{eID}s{sID}g{gID}"
              value={seedFormula}
              onChange={(e) => setSeedFormula(e.currentTarget.value)}
            />
          </Group>
          <Inline justify="space-between">
            <Button
              variant="subtle"
              color="red"
              size="sm"
              disabled={!group.template_json || busy}
              onClick={() => void handleSave(true)}
            >
              Clear template
            </Button>
            <Group gap="xs">
              <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={() => void handleSave(false)}>
                Save template
              </Button>
            </Group>
          </Inline>
        </FormContainer>
      </Stack>
    </CoreModal>
  );
}

// ---------------------------------------------------------------------------
// GroupScaffoldModal
// ---------------------------------------------------------------------------

function GroupScaffoldModal({
  group,
  existingStageCount,
  slug,
  token,
  onScaffolded,
  onClose,
}: {
  group: StageGroup;
  existingStageCount: number;
  slug: string | undefined;
  token: string | null;
  onScaffolded: () => void;
  onClose: () => void;
}) {
  const tpl = group.template_json ?? ({} as GroupTemplate);
  const hasTemplate = !!tpl.mechanism;

  const [count, setCount] = useState('');
  const [firstStartsAt, setFirstStartsAt] = useState('');
  const [stageDurationDays, setStageDurationDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countNum = parseInt(count, 10);
  const durationNum = parseInt(stageDurationDays, 10);

  const previewItems =
    Number.isFinite(countNum) && countNum > 0
      ? Array.from({ length: Math.min(countNum, 5) }, (_, i) => {
          const n = existingStageCount + i + 1;
          const label = resolvePreviewLabel(tpl.label_pattern, n);
          let dateRange: string | null = null;
          if (firstStartsAt && Number.isFinite(durationNum) && durationNum > 0) {
            const start = new Date(firstStartsAt);
            start.setUTCDate(start.getUTCDate() + i * durationNum);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + durationNum);
            dateRange = `${formatDate(start)} – ${formatDate(end)}`;
          } else if (firstStartsAt && i === 0) {
            dateRange = `from ${formatDate(new Date(firstStartsAt))}`;
          }
          return { label, dateRange };
        })
      : [];
  const remaining = Number.isFinite(countNum) && countNum > 5 ? countNum - 5 : 0;

  async function handleScaffold() {
    if (!token || !slug) return;
    if (!Number.isFinite(countNum) || countNum < 1 || countNum > 50) {
      setError('Count must be between 1 and 50.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await postJsonAuth(
        `/events/${encodeURIComponent(slug)}/stage-groups/${group.id}/scaffold`,
        token,
        {
          count: countNum,
          first_starts_at: firstStartsAt || null,
          stage_duration_days: Number.isFinite(durationNum) && durationNum > 0 ? durationNum : null,
        },
      );
      onScaffolded();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Scaffold failed.')
          : 'Scaffold failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const createLabel =
    Number.isFinite(countNum) && countNum > 0
      ? `Create ${countNum} stage${countNum === 1 ? '' : 's'}`
      : 'Create stages';

  return (
    <CoreModal opened onClose={onClose} title={`Scaffold stages into ${group.label}`} size="md">
      <Stack gap="sm">
        {!hasTemplate ? (
          <Alert color="orange" variant="light">
            This group needs a stage template with a mechanism set before scaffolding.
          </Alert>
        ) : null}
        {error ? (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        ) : null}
        <FormContainer>
          <TextInput
            label="Number of stages"
            placeholder="e.g. 8"
            value={count}
            onChange={(e) => setCount(e.currentTarget.value.replace(/\D/g, ''))}
            disabled={!hasTemplate}
            autoFocus
          />
          <Group grow>
            <TextInput
              type="date"
              label="First stage starts"
              description="Optional — leave blank to set dates later"
              value={firstStartsAt}
              onChange={(e) => setFirstStartsAt(e.currentTarget.value)}
              disabled={!hasTemplate}
            />
            <TextInput
              label="Stage duration (days)"
              placeholder="e.g. 7"
              value={stageDurationDays}
              onChange={(e) => setStageDurationDays(e.currentTarget.value.replace(/\D/g, ''))}
              disabled={!hasTemplate || !firstStartsAt}
            />
          </Group>
          {previewItems.length > 0 ? (
            <Stack gap={4}>
              <Text size="xs" fw={600} c="dimmed">
                Preview
              </Text>
              {previewItems.map((item, i) => (
                <Inline key={i} gap="xs" align="baseline">
                  <Text size="xs">• {item.label}</Text>
                  {item.dateRange ? (
                    <Text size="xs" c="dimmed">
                      {item.dateRange}
                    </Text>
                  ) : null}
                </Inline>
              ))}
              {remaining > 0 ? (
                <Text size="xs" c="dimmed">
                  … and {remaining} more
                </Text>
              ) : null}
              {tpl.game_count ? (
                <Text size="xs" c="dimmed">
                  Each stage will include {tpl.game_count} game slot
                  {tpl.game_count === 1 ? '' : 's'}
                </Text>
              ) : null}
            </Stack>
          ) : null}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={busy}
              disabled={!hasTemplate || !Number.isFinite(countNum) || countNum < 1}
              onClick={() => void handleScaffold()}
            >
              {createLabel}
            </Button>
          </Group>
        </FormContainer>
      </Stack>
    </CoreModal>
  );
}

// ---------------------------------------------------------------------------
// GroupCard
// ---------------------------------------------------------------------------

function GroupCard({
  group,
  groupStages,
  onClone,
  onDelete,
  onToggleVisible,
  onDeleteGroup,
  onEditGroup,
  onGroupUpdated,
  onStagesScaffolded,
  onNavigate,
  busy,
  slug,
  transitionByPredecessor,
  token,
  onTransitionSaved,
  onTransitionDeleted,
  variants,
  simulationMode,
}: {
  group: StageGroup;
  groupStages: StageSummary[];
  onClone: (stageId: number) => void;
  onDelete: (stageId: number) => void;
  onToggleVisible: (stageId: number) => void;
  onDeleteGroup: (groupId: number) => void;
  onEditGroup: (group: StageGroup) => void;
  onGroupUpdated: (updated: StageGroup) => void;
  onStagesScaffolded: () => void;
  onNavigate: (path: string) => void;
  busy: number | null;
  slug: string | undefined;
  transitionByPredecessor: Map<string, StageTransition>;
  token: string | null;
  onTransitionSaved: (t: StageTransition) => void;
  onTransitionDeleted: (id: number) => void;
  variants: HanabiVariant[];
  simulationMode?: boolean;
}) {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [scaffoldOpen, setScaffoldOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g-${group.id}`,
    data: { type: 'group', groupId: group.id },
  });

  const cfg = group.scoring_config_json as {
    method?: string;
    n?: number;
    absent_score_policy?: string;
  };
  const methodLabel = cfg.method === 'best_of_n' ? `Best ${cfg.n ?? '?'} of N` : 'Sum';
  const stageIds = groupStages.map((s) => String(s.id));
  const droppableId = `group-${group.id}`;

  return (
    <>
      <Card
        ref={setNodeRef}
        variant="subtle"
        padding="none"
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
          opacity: isDragging ? 0.3 : 1,
        }}
      >
        <CardHeader>
          <Inline justify="space-between" align="center">
            <Inline gap="sm" align="center" wrap={false} style={{ flex: 1, minWidth: 0 }}>
              <span
                {...attributes}
                {...listeners}
                style={{
                  cursor: 'grab',
                  userSelect: 'none',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--ds-color-text-muted)',
                }}
                aria-label="Drag to reorder group"
              >
                <MaterialIcon name="drag_indicator" size={20} />
              </span>
              <Stack gap={4}>
                <Inline gap="xs" align="center">
                  <Heading level={4}>{group.label}</Heading>
                  <Badge color="teal" variant="light" size="sm">
                    Group
                  </Badge>
                  <Badge color="gray" variant="light" size="sm">
                    {methodLabel}
                  </Badge>
                  {!group.visible && (
                    <Badge color="orange" variant="light" size="sm">
                      Hidden
                    </Badge>
                  )}
                </Inline>
                <Text size="xs" c="dimmed">
                  {group.stage_count} stage{group.stage_count === 1 ? '' : 's'}
                </Text>
              </Stack>
            </Inline>
            <Inline gap="xs">
              <CoreActionIcon
                variant={group.template_json ? 'light' : 'subtle'}
                color={group.template_json ? 'teal' : 'gray'}
                size="sm"
                title={group.template_json ? 'Edit stage template' : 'Set stage template'}
                onClick={() => setTemplateOpen(true)}
              >
                <MaterialIcon name="tune" size={16} />
              </CoreActionIcon>
              <CoreActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Scaffold stages from template"
                disabled={!group.template_json}
                onClick={() => setScaffoldOpen(true)}
              >
                <MaterialIcon name="playlist_add" size={16} />
              </CoreActionIcon>
              <CoreActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                title="Edit"
                onClick={() => onEditGroup(group)}
              >
                <MaterialIcon name="edit" size={16} />
              </CoreActionIcon>
              <CoreActionIcon
                variant="subtle"
                color="red"
                size="sm"
                title="Delete"
                onClick={() => onDeleteGroup(group.id)}
              >
                <MaterialIcon name="delete" size={16} />
              </CoreActionIcon>
            </Inline>
          </Inline>
        </CardHeader>
        <CardBody>
          <SortableContext items={stageIds} strategy={verticalListSortingStrategy}>
            {groupStages.length === 0 ? (
              <DroppableEmptySlot id={droppableId} />
            ) : (
              <Stack gap={0}>
                {groupStages.map((stage, i) => {
                  const isLast = i === groupStages.length - 1;
                  const transition = transitionByPredecessor.get(`stage-${stage.id}`);
                  return (
                    <Stack key={stage.id} gap={0}>
                      <SortableStageCard
                        stage={stage}
                        onClone={onClone}
                        onDelete={onDelete}
                        onToggleVisible={onToggleVisible}
                        onNavigate={onNavigate}
                        busy={busy}
                        variants={variants}
                        simulationMode={simulationMode}
                      />
                      {!isLast && (
                        <TransitionNode
                          transition={transition}
                          afterStageId={stage.id}
                          slug={slug}
                          token={token}
                          onSaved={onTransitionSaved}
                          onDeleted={onTransitionDeleted}
                        />
                      )}
                    </Stack>
                  );
                })}
              </Stack>
            )}
          </SortableContext>
        </CardBody>
      </Card>
      {templateOpen ? (
        <GroupTemplateModal
          group={group}
          slug={slug}
          token={token}
          variants={variants}
          onSave={onGroupUpdated}
          onClose={() => setTemplateOpen(false)}
        />
      ) : null}
      {scaffoldOpen ? (
        <GroupScaffoldModal
          group={group}
          existingStageCount={groupStages.length}
          slug={slug}
          token={token}
          onScaffolded={onStagesScaffolded}
          onClose={() => setScaffoldOpen(false)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// TransitionNode — rendered between adjacent top-level ledger items
// ---------------------------------------------------------------------------

const EMPTY_FILTER: FilterType = 'ALL';
const EMPTY_SEEDING: SeedingMethod = 'PRESERVE';

function TransitionNode({
  transition,
  afterStageId,
  afterGroupId,
  slug,
  token,
  onSaved,
  onDeleted,
}: {
  transition: StageTransition | undefined;
  afterStageId?: number;
  afterGroupId?: number;
  slug: string | undefined;
  token: string | null;
  onSaved: (t: StageTransition) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>(transition?.filter_type ?? EMPTY_FILTER);
  const [filterValue, setFilterValue] = useState(
    transition?.filter_value != null ? String(transition.filter_value) : '',
  );
  const [seedingMethod, setSeedingMethod] = useState<SeedingMethod>(
    transition?.seeding_method ?? EMPTY_SEEDING,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openEdit() {
    setFilterType(transition?.filter_type ?? EMPTY_FILTER);
    setFilterValue(transition?.filter_value != null ? String(transition.filter_value) : '');
    setSeedingMethod(transition?.seeding_method ?? EMPTY_SEEDING);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (!token || !slug) return;
    if ((filterType === 'TOP_N' || filterType === 'THRESHOLD') && !filterValue) {
      setError('Filter value is required for Top N and Threshold.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const url =
        afterStageId != null
          ? `/events/${encodeURIComponent(slug)}/transitions/after-stage/${afterStageId}`
          : `/events/${encodeURIComponent(slug)}/transitions/after-group/${afterGroupId}`;
      const saved = await putJsonAuth<StageTransition>(url, token, {
        filter_type: filterType,
        filter_value: filterValue ? Number(filterValue) : null,
        seeding_method: seedingMethod,
      });
      setEditing(false);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to save.')
          : 'Failed to save.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!token || !slug || !transition) return;
    setBusy(true);
    try {
      await deleteJsonAuth(
        `/events/${encodeURIComponent(slug)}/transitions/${transition.id}`,
        token,
      );
      setEditing(false);
      onDeleted(transition.id);
    } catch {
      setError('Failed to remove transition.');
    } finally {
      setBusy(false);
    }
  }

  const isPassthrough = !transition;
  const summary = transition ? transitionSummary(transition) : null;

  return (
    <Stack gap={4}>
      {/* Horizontal scrubber row */}
      <Group gap={6} align="center" wrap="nowrap">
        <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-gray-3)' }} />
        <Text size="xs" c="dimmed" style={{ fontStyle: 'italic', whiteSpace: 'nowrap' }}>
          {isPassthrough ? 'passthrough' : summary}
        </Text>
        <CoreActionIcon
          variant="subtle"
          color="gray"
          size="xs"
          title={isPassthrough ? 'Add transition' : 'Edit transition'}
          onClick={openEdit}
        >
          <MaterialIcon name={isPassthrough ? 'add' : 'edit'} size={12} />
        </CoreActionIcon>
        {!isPassthrough && (
          <CoreActionIcon
            variant="subtle"
            color="red"
            size="xs"
            title="Remove transition"
            disabled={busy}
            onClick={() => void handleDelete()}
          >
            <MaterialIcon name="close" size={12} />
          </CoreActionIcon>
        )}
        <div style={{ flex: 1, height: 1, background: 'var(--mantine-color-gray-3)' }} />
      </Group>

      {/* Inline edit form */}
      {editing && (
        <SectionCard style={{ width: '100%', maxWidth: 480 }}>
          <Stack gap="sm">
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <FormContainer>
              <Group grow>
                <CoreSelect
                  label="Filter"
                  value={filterType}
                  onChange={(v) => {
                    setFilterType((v ?? 'ALL') as FilterType);
                    if (v === 'ALL' || v === 'MANUAL') setFilterValue('');
                  }}
                  data={FILTER_TYPES}
                />
                <TextInput
                  label="Filter value"
                  placeholder={
                    filterType === 'TOP_N' ? 'e.g. 8' : filterType === 'THRESHOLD' ? 'e.g. 20' : '—'
                  }
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.currentTarget.value.replace(/\D/g, ''))}
                  disabled={filterType === 'ALL' || filterType === 'MANUAL'}
                />
                <CoreSelect
                  label="Seeding"
                  value={seedingMethod}
                  onChange={(v) => setSeedingMethod((v ?? 'PRESERVE') as SeedingMethod)}
                  data={SEEDING_METHODS}
                />
              </Group>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="default"
                  size="sm"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" loading={busy} onClick={() => void handleSave()}>
                  Save
                </Button>
              </Group>
            </FormContainer>
          </Stack>
        </SectionCard>
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function AdminEventStagesPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const simulationMode = useSimulationMode();

  const { events: allEvents } = useEvents({ includeUnpublishedForAdmin: true });
  const eventName = allEvents.find((e) => e.slug === slug)?.name ?? slug ?? '';

  const {
    stages,
    loading: stagesLoading,
    error: stagesError,
    refetch: refetchStages,
    patchStage,
    removeStage,
    appendStage,
  } = useStages(slug);
  const {
    groups,
    loading: groupsLoading,
    error: groupsError,
    refetch: refetchGroups,
    patchGroup,
    removeGroup,
    appendGroup,
  } = useStageGroups(slug);
  const { transitions, upsertTransition, removeTransition } = useStageTransitions(slug);
  const { variants } = useVariants();

  const [actionError, setActionError] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState<number | null>(null);
  const [activeStage, setActiveStage] = useState<StageSummary | null>(null);
  const [activeGroup, setActiveGroup] = useState<StageGroup | null>(null);

  // Group form state
  const [groupFormOpen, setGroupFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<StageGroup | null>(null);
  const [groupLabel, setGroupLabel] = useState('');
  const [groupScoringMethod, setGroupScoringMethod] = useState<'sum' | 'best_of_n'>('sum');
  const [groupBestOfN, setGroupBestOfN] = useState('');
  const [groupAbsentPolicy, setGroupAbsentPolicy] = useState<'null_as_zero' | 'exclude'>(
    'null_as_zero',
  );
  const [groupVisible, setGroupVisible] = useState(true);
  const [groupFormError, setGroupFormError] = useState<string | null>(null);
  const [groupBusy, setGroupBusy] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<StageGroup | null>(null);
  const [deleteGroupBusy, setDeleteGroupBusy] = useState(false);
  const [deleteGroupError, setDeleteGroupError] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ---------------------------------------------------------------------------
  // Stage actions
  // ---------------------------------------------------------------------------

  async function handleReorder(stageId: number, newIndex: number) {
    if (!token || !slug) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}/reorder`, token, {
        stage_index: newIndex,
      });
      // Reorder swaps indices on two stages — refetch to stay consistent (no flash: data exists)
      refetchStages();
    } catch {
      setActionError('Failed to reorder stage.');
    } finally {
      setStageBusy(null);
    }
  }

  async function handleBulkReorder(stageIds: number[]) {
    if (!token || !slug) return;
    setActionError(null);
    try {
      await patchJsonAuth(`/events/${encodeURIComponent(slug)}/stages/reorder-bulk`, token, {
        stage_ids: stageIds,
      });
      refetchStages();
    } catch {
      setActionError('Failed to reorder.');
    }
  }

  async function handleAssignGroup(stageId: number, groupId: number | null) {
    if (!token || !slug) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      const updated = await patchJsonAuth<StageSummary>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/group`,
        token,
        { group_id: groupId },
      );
      patchStage(stageId, updated);
      // Group stage_count changes — silent background refresh
      refetchGroups();
    } catch {
      setActionError('Failed to assign stage to group.');
    } finally {
      setStageBusy(null);
    }
  }

  async function handleCloneStage(stageId: number) {
    if (!token || !slug) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      const cloned = await postJsonAuth<StageSummary>(
        `/events/${encodeURIComponent(slug)}/stages/${stageId}/clone`,
        token,
        {},
      );
      appendStage(cloned);
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
      removeStage(stageId);
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

  async function handleToggleVisible(stageId: number) {
    if (!token || !slug) return;
    const stage = stages.find((s) => s.id === stageId);
    if (!stage) return;
    setStageBusy(stageId);
    setActionError(null);
    try {
      await putJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${stageId}`, token, {
        visible: !stage.visible,
      });
      patchStage(stageId, { visible: !stage.visible });
    } catch {
      setActionError('Failed to update stage visibility.');
    } finally {
      setStageBusy(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Group actions
  // ---------------------------------------------------------------------------

  function openCreateGroup() {
    setEditingGroup(null);
    setGroupLabel('');
    setGroupScoringMethod('sum');
    setGroupBestOfN('');
    setGroupAbsentPolicy('null_as_zero');
    setGroupVisible(true);
    setGroupFormError(null);
    setGroupFormOpen(true);
  }

  function openEditGroup(group: StageGroup) {
    setEditingGroup(group);
    setGroupLabel(group.label);
    const cfg = group.scoring_config_json as {
      method?: string;
      n?: number;
      absent_score_policy?: string;
    };
    setGroupScoringMethod((cfg.method as 'sum' | 'best_of_n') ?? 'sum');
    setGroupBestOfN(cfg.n != null ? String(cfg.n) : '');
    setGroupAbsentPolicy((cfg.absent_score_policy as 'null_as_zero' | 'exclude') ?? 'null_as_zero');
    setGroupVisible(group.visible);
    setGroupFormError(null);
    setGroupFormOpen(true);
  }

  async function handleSaveGroup() {
    if (!token || !slug) return;
    if (!groupLabel.trim()) {
      setGroupFormError('Label is required.');
      return;
    }
    if (groupScoringMethod === 'best_of_n' && (!groupBestOfN || Number(groupBestOfN) < 1)) {
      setGroupFormError('N must be a positive integer for Best of N scoring.');
      return;
    }

    const scoring_config_json: Record<string, unknown> = {
      method: groupScoringMethod,
      absent_score_policy: groupAbsentPolicy,
    };
    if (groupScoringMethod === 'best_of_n') {
      scoring_config_json.n = Number(groupBestOfN);
    }

    setGroupBusy(true);
    setGroupFormError(null);
    try {
      if (editingGroup) {
        const updated = await putJsonAuth<StageGroup>(
          `/events/${encodeURIComponent(slug)}/stage-groups/${editingGroup.id}`,
          token,
          { label: groupLabel, scoring_config_json, visible: groupVisible },
        );
        patchGroup(editingGroup.id, updated);
      } else {
        const created = await postJsonAuth<StageGroup>(
          `/events/${encodeURIComponent(slug)}/stage-groups`,
          token,
          { label: groupLabel, scoring_config_json, visible: groupVisible },
        );
        appendGroup(created);
      }
      setGroupFormOpen(false);
    } catch (err) {
      setGroupFormError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to save group.')
          : 'Failed to save group.',
      );
    } finally {
      setGroupBusy(false);
    }
  }

  function handleDeleteGroup(groupId: number) {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    setDeleteGroupError(null);
    setDeleteGroupTarget(group);
  }

  async function handleConfirmDeleteGroup(mode: 'delete_stages' | 'ungroup_only') {
    if (!token || !slug || !deleteGroupTarget) return;
    setDeleteGroupBusy(true);
    setDeleteGroupError(null);
    const groupId = deleteGroupTarget.id;
    const memberStages = stages.filter((s) => s.group_id === groupId);
    try {
      if (mode === 'delete_stages') {
        for (const s of memberStages) {
          await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${s.id}`, token);
          removeStage(s.id);
        }
      } else {
        // Ungroup all member stages first so the group can be deleted
        for (const s of memberStages) {
          await patchJsonAuth(`/events/${encodeURIComponent(slug)}/stages/${s.id}/group`, token, {
            group_id: null,
          });
          patchStage(s.id, { group_id: null });
        }
      }
      await deleteJsonAuth(`/events/${encodeURIComponent(slug)}/stage-groups/${groupId}`, token);
      removeGroup(groupId);
      setDeleteGroupTarget(null);
    } catch (err) {
      setDeleteGroupError(
        err instanceof ApiError
          ? ((err.body as { error?: string })?.error ?? 'Failed to remove group.')
          : 'Failed to remove group.',
      );
    } finally {
      setDeleteGroupBusy(false);
    }
  }

  // ---------------------------------------------------------------------------
  // DnD handlers
  // ---------------------------------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as
      | { type: 'stage'; stageId: number; groupId: number | null }
      | { type: 'group'; groupId: number }
      | undefined;
    if (data?.type === 'stage') {
      const found = stages.find((s) => s.id === data.stageId);
      setActiveStage(found ?? null);
    } else if (data?.type === 'group') {
      const found = groups.find((g) => g.id === data.groupId);
      setActiveGroup(found ?? null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveStage(null);
    setActiveGroup(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const dragData = active.data.current as
      | { type: 'stage'; stageId: number; groupId: number | null }
      | { type: 'group'; groupId: number }
      | undefined;
    if (!dragData) return;

    void (async () => {
      // Helper: expand a ledger (groups + ungrouped stages) to an ordered flat list of stage IDs.
      // Groups contribute their stages in ascending stage_index order.
      function expandToStageIds(
        ledger: Array<
          | { type: 'group'; group: StageGroup; sortKey: number }
          | { type: 'stage'; stage: StageSummary; sortKey: number }
        >,
        byGroup: Map<number, StageSummary[]>,
      ): number[] {
        const ids: number[] = [];
        for (const item of ledger) {
          if (item.type === 'group') {
            const gs = byGroup.get(item.group.id) ?? [];
            [...gs].sort((a, b) => a.stage_index - b.stage_index).forEach((s) => ids.push(s.id));
          } else {
            ids.push(item.stage.id);
          }
        }
        return ids;
      }

      // Sentinel drop zones — move dragged item to absolute start or end of ledger
      const overId = String(over.id);
      if (overId === LEDGER_SENTINEL_START || overId === LEDGER_SENTINEL_END) {
        const targetIdx = overId === LEDGER_SENTINEL_START ? 0 : ledgerItems.length - 1;
        let fromIdx: number;
        if (dragData.type === 'group') {
          fromIdx = ledgerItems.findIndex(
            (item) => item.type === 'group' && item.group.id === dragData.groupId,
          );
        } else {
          const s = stages.find((s) => s.id === dragData.stageId);
          if (s?.group_id != null) return; // grouped stage — not a ledger-level item
          fromIdx = ledgerItems.findIndex(
            (item) => item.type === 'stage' && item.stage.id === dragData.stageId,
          );
        }
        if (fromIdx === -1 || fromIdx === targetIdx) return;
        await handleBulkReorder(
          expandToStageIds(arrayMove(ledgerItems, fromIdx, targetIdx), stagesByGroup),
        );
        return;
      }

      if (dragData.type === 'group') {
        // Group dragged — reorder ledger
        const fromIdx = ledgerItems.findIndex(
          (item) => item.type === 'group' && item.group.id === dragData.groupId,
        );
        const toIdx = overId.startsWith('g-')
          ? ledgerItems.findIndex(
              (item) => item.type === 'group' && item.group.id === Number(overId.slice(2)),
            )
          : ledgerItems.findIndex(
              (item) => item.type === 'stage' && item.stage.id === Number(overId),
            );
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        await handleBulkReorder(
          expandToStageIds(arrayMove(ledgerItems, fromIdx, toIdx), stagesByGroup),
        );
        return;
      }

      // Stage drag
      const draggedId = dragData.stageId;
      const draggedStage = stages.find((s) => s.id === draggedId);
      if (!draggedStage) return;

      // Stage dropped onto a group's ledger item (not into the group body)
      if (overId.startsWith('g-')) {
        const fromIdx = ledgerItems.findIndex(
          (item) => item.type === 'stage' && item.stage.id === draggedId,
        );
        const toIdx = ledgerItems.findIndex(
          (item) => item.type === 'group' && item.group.id === Number(overId.slice(2)),
        );
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        await handleBulkReorder(
          expandToStageIds(arrayMove(ledgerItems, fromIdx, toIdx), stagesByGroup),
        );
        return;
      }

      const overData = over.data.current as
        | { type: 'stage'; stageId: number; groupId: number | null }
        | { type: 'container'; containerId: string }
        | undefined;

      if (!overData) return;

      let targetGroupId: number | null;
      let overStageId: number | null = null;

      if (overData.type === 'container') {
        const cid = overData.containerId;
        targetGroupId = cid === 'ungrouped' ? null : Number(cid.replace('group-', ''));
      } else {
        targetGroupId = overData.groupId ?? null;
        overStageId = overData.stageId;
      }

      const isCross = targetGroupId !== (draggedStage.group_id ?? null);
      if (isCross) {
        await handleAssignGroup(draggedId, targetGroupId);
      } else if (overStageId && overStageId !== draggedId) {
        if (draggedStage.group_id == null) {
          // Ungrouped stage reordered among other ungrouped stages — use ledger bulk reorder
          const fromIdx = ledgerItems.findIndex(
            (item) => item.type === 'stage' && item.stage.id === draggedId,
          );
          const toIdx = ledgerItems.findIndex(
            (item) => item.type === 'stage' && item.stage.id === overStageId,
          );
          if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
            await handleBulkReorder(
              expandToStageIds(arrayMove(ledgerItems, fromIdx, toIdx), stagesByGroup),
            );
          }
        } else {
          // Within-group reorder — single stage swap
          const overStage = stages.find((s) => s.id === overStageId);
          if (overStage) await handleReorder(draggedId, overStage.stage_index);
        }
      }
    })();
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const stagesByGroup = new Map<number, StageSummary[]>();
  const ungroupedStages: StageSummary[] = [];
  for (const stage of stages) {
    if (stage.group_id != null) {
      if (!stagesByGroup.has(stage.group_id)) stagesByGroup.set(stage.group_id, []);
      stagesByGroup.get(stage.group_id)!.push(stage);
    } else {
      ungroupedStages.push(stage);
    }
  }

  // Transition lookup by predecessor key
  const transitionByPredecessor = new Map<string, StageTransition>();
  for (const t of transitions) {
    if (t.after_stage_id != null) transitionByPredecessor.set(`stage-${t.after_stage_id}`, t);
    else if (t.after_group_id != null) transitionByPredecessor.set(`group-${t.after_group_id}`, t);
  }

  if (stagesLoading || groupsLoading) {
    return (
      <Text c="dimmed" size="sm">
        Loading…
      </Text>
    );
  }

  if (stagesError || groupsError) {
    return (
      <Alert color="red" variant="light">
        {stagesError ?? groupsError}
      </Alert>
    );
  }

  // Build an interleaved ledger: groups and ungrouped stages ordered by stage_index
  type LedgerItem =
    | { type: 'group'; group: StageGroup; sortKey: number }
    | { type: 'stage'; stage: StageSummary; sortKey: number };

  const ledgerItems: LedgerItem[] = [];
  for (const group of groups) {
    const gs = stagesByGroup.get(group.id) ?? [];
    const minIdx = gs.length > 0 ? Math.min(...gs.map((s) => s.stage_index)) : Infinity;
    ledgerItems.push({ type: 'group', group, sortKey: minIdx });
  }
  for (const stage of ungroupedStages) {
    ledgerItems.push({ type: 'stage', stage, sortKey: stage.stage_index });
  }
  ledgerItems.sort((a, b) => a.sortKey - b.sortKey);

  const ledgerSortableIds = ledgerItems.map((item) =>
    item.type === 'group' ? `g-${item.group.id}` : String(item.stage.id),
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={ledgerCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <Stack gap="md">
        {actionError ? (
          <Alert color="red" variant="light">
            {actionError}
          </Alert>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/* Toolbar */}
        {/* ------------------------------------------------------------------ */}
        <Group justify="space-between">
          <Text fw={600} size="sm">
            Stages ({stages.length})
            {groups.length > 0 ? ` · ${groups.length} group${groups.length === 1 ? '' : 's'}` : ''}
          </Text>
          <Group gap="xs">
            {simulationMode && slug && eventName && (
              <SimulateEventButton eventSlug={slug} eventName={eventName} />
            )}
            <Button size="sm" variant="default" onClick={openCreateGroup}>
              Add Group
            </Button>
            <Button size="sm" onClick={() => navigate(`/admin/events/${slug}/stages/new`)}>
              Add Stage
            </Button>
          </Group>
        </Group>

        {/* Group create/edit form */}
        {groupFormOpen && (
          <SectionCard>
            <Stack gap="sm">
              <Text fw={600} size="sm">
                {editingGroup ? 'Edit Group' : 'New Group'}
              </Text>

              {groupFormError ? (
                <Alert color="red" variant="light">
                  {groupFormError}
                </Alert>
              ) : null}

              <FormContainer>
                <TextInput
                  label="Label"
                  value={groupLabel}
                  onChange={(e) => setGroupLabel(e.currentTarget.value)}
                  placeholder="e.g. Qualifying"
                />
                <Group grow>
                  <CoreSelect
                    label="Scoring Method"
                    value={groupScoringMethod}
                    onChange={(v) => setGroupScoringMethod((v ?? 'sum') as 'sum' | 'best_of_n')}
                    data={[
                      { value: 'sum', label: 'Sum of all stages' },
                      { value: 'best_of_n', label: 'Best N stages' },
                    ]}
                  />
                  {groupScoringMethod === 'best_of_n' && (
                    <TextInput
                      label="N (stages to count)"
                      value={groupBestOfN}
                      onChange={(e) => setGroupBestOfN(e.currentTarget.value.replace(/\D/g, ''))}
                      placeholder="e.g. 6"
                    />
                  )}
                  <CoreSelect
                    label="Absent Score Policy"
                    value={groupAbsentPolicy}
                    onChange={(v) =>
                      setGroupAbsentPolicy((v ?? 'null_as_zero') as 'null_as_zero' | 'exclude')
                    }
                    data={[
                      { value: 'null_as_zero', label: 'Count missing as 0' },
                      { value: 'exclude', label: 'Exclude missing stages' },
                    ]}
                  />
                </Group>
                <Switch
                  label="Visible to users"
                  description="When off, the grouping is hidden from public views — stages appear individually."
                  checked={groupVisible}
                  onChange={(e) => setGroupVisible(e.currentTarget.checked)}
                />
                <Group justify="flex-end" gap="xs">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => setGroupFormOpen(false)}
                    disabled={groupBusy}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" loading={groupBusy} onClick={() => void handleSaveGroup()}>
                    {editingGroup ? 'Save' : 'Create'}
                  </Button>
                </Group>
              </FormContainer>
            </Stack>
          </SectionCard>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Unified ledger with inline transition nodes */}
        {/* ------------------------------------------------------------------ */}
        {stages.length === 0 && groups.length === 0 ? (
          <Text c="dimmed" size="sm">
            No stages yet. Add one to get started.
          </Text>
        ) : (
          <SortableContext items={ledgerSortableIds} strategy={verticalListSortingStrategy}>
            <Stack gap={0}>
              <LedgerSentinelZone id={LEDGER_SENTINEL_START} />
              {ledgerItems.map((item, i) => {
                const isLast = i === ledgerItems.length - 1;
                const predecessorKey =
                  item.type === 'group' ? `group-${item.group.id}` : `stage-${item.stage.id}`;
                const transition = transitionByPredecessor.get(predecessorKey);

                return (
                  <Stack
                    key={item.type === 'group' ? `g-${item.group.id}` : `s-${item.stage.id}`}
                    gap={0}
                  >
                    {item.type === 'group' ? (
                      <GroupCard
                        group={item.group}
                        groupStages={stagesByGroup.get(item.group.id) ?? []}
                        onClone={handleCloneStage}
                        onDelete={handleDeleteStage}
                        onToggleVisible={handleToggleVisible}
                        onDeleteGroup={(id) => void handleDeleteGroup(id)}
                        onEditGroup={openEditGroup}
                        onGroupUpdated={(updated) => patchGroup(updated.id, updated)}
                        onStagesScaffolded={() => {
                          refetchStages();
                          refetchGroups();
                        }}
                        onNavigate={navigate}
                        busy={stageBusy}
                        slug={slug}
                        transitionByPredecessor={transitionByPredecessor}
                        token={token}
                        onTransitionSaved={upsertTransition}
                        onTransitionDeleted={removeTransition}
                        variants={variants}
                        simulationMode={simulationMode}
                      />
                    ) : (
                      <SortableStageCard
                        stage={item.stage}
                        onClone={handleCloneStage}
                        onDelete={handleDeleteStage}
                        onToggleVisible={handleToggleVisible}
                        onNavigate={navigate}
                        busy={stageBusy}
                        variants={variants}
                        simulationMode={simulationMode}
                      />
                    )}
                    {!isLast && (
                      <TransitionNode
                        transition={transition}
                        afterStageId={item.type === 'stage' ? item.stage.id : undefined}
                        afterGroupId={item.type === 'group' ? item.group.id : undefined}
                        slug={slug}
                        token={token}
                        onSaved={upsertTransition}
                        onDeleted={removeTransition}
                      />
                    )}
                  </Stack>
                );
              })}
              {groups.length > 0 && ungroupedStages.length === 0 && (
                <DroppableEmptySlot id="ungrouped" />
              )}
              <LedgerSentinelZone id={LEDGER_SENTINEL_END} />
            </Stack>
          </SortableContext>
        )}
      </Stack>

      <DragOverlay>
        {activeStage ? (
          <StageCardContent
            stage={activeStage}
            onClone={handleCloneStage}
            onDelete={handleDeleteStage}
            onToggleVisible={handleToggleVisible}
            onNavigate={navigate}
            busy={stageBusy}
            overlay={true}
          />
        ) : activeGroup ? (
          <Card
            variant="subtle"
            padding="none"
            style={{ opacity: 0.85, boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}
          >
            <CardHeader>
              <Inline gap="sm" align="center">
                <MaterialIcon
                  name="drag_indicator"
                  size={20}
                  style={{ color: 'var(--ds-color-text-muted)', flexShrink: 0 }}
                />
                <Heading level={4}>{activeGroup.label}</Heading>
                <Badge color="teal" variant="light" size="sm">
                  Group
                </Badge>
              </Inline>
            </CardHeader>
          </Card>
        ) : null}
      </DragOverlay>

      {deleteGroupTarget && (
        <CoreModal
          opened
          onClose={() => {
            if (!deleteGroupBusy) setDeleteGroupTarget(null);
          }}
          title={`Remove group: ${deleteGroupTarget.label}`}
          size="sm"
        >
          <Stack gap="sm">
            {deleteGroupError && (
              <Alert color="red" variant="light">
                {deleteGroupError}
              </Alert>
            )}
            <Text size="sm">
              This group contains {deleteGroupTarget.stage_count} stage
              {deleteGroupTarget.stage_count === 1 ? '' : 's'}. What would you like to do?
            </Text>
            <Stack gap="xs">
              <Button
                fullWidth
                variant="default"
                disabled={deleteGroupBusy}
                onClick={() => void handleConfirmDeleteGroup('ungroup_only')}
              >
                Remove group only
              </Button>
              <Button
                fullWidth
                color="red"
                disabled={deleteGroupBusy}
                onClick={() => void handleConfirmDeleteGroup('delete_stages')}
              >
                Delete group and all {deleteGroupTarget.stage_count} stage
                {deleteGroupTarget.stage_count === 1 ? '' : 's'}
              </Button>
            </Stack>
          </Stack>
        </CoreModal>
      )}
    </DndContext>
  );
}
