import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// End-condition enum constants
// ---------------------------------------------------------------------------

export type EndConditionDef = { code: number; label: string };

/** Canonical hanab.live end-condition codes and their display labels. */
export const END_CONDITIONS: EndConditionDef[] = [
  { code: 1, label: 'Normal' },
  { code: 10, label: 'VTK' },
  { code: 4, label: 'VTK (legacy)' },
  { code: 2, label: 'Strikeout' },
  { code: 3, label: 'Timeout' },
  { code: 5, label: 'Speedrun fail' },
  { code: 6, label: 'Idle timeout' },
  { code: 7, label: 'Character softlock' },
  { code: 8, label: 'All or nothing fail' },
  { code: 9, label: 'All or nothing softlock' },
  { code: 0, label: 'In progress' },
];

/** Global default rank order for end_condition: index 0 = ranked first/best.
 *  Stored per-chain-entry as `order` and can be overridden at the point of use. */
export const DEFAULT_END_CONDITION_ORDER: number[] = END_CONDITIONS.map((e) => e.code);
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ActionIcon,
  CoreBadge as Badge,
  CoreButton as Button,
  CoreGroup as Group,
  CoreStack as Stack,
  CoreText as Text,
  CoreTextInput as TextInput,
  MaterialIcon,
} from '../../../design-system';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ObservableType =
  | 'score'
  | 'max_score'
  | 'bdr'
  | 'strikes'
  | 'clues_remaining'
  | 'turns'
  | 'start_time'
  | 'end_time'
  | 'elapsed_time'
  | 'end_condition';

export type ObservableItem = {
  kind: 'observable';
  type: ObservableType;
  direction: 'asc' | 'desc';
  /** For enum-typed observables (e.g., end_condition): codes ranked best-first.
   *  If absent, DEFAULT_END_CONDITION_ORDER is used at evaluation time. */
  order?: number[];
};

export type UserInputItem = {
  kind: 'user_input';
  type: 'bdr' | 'strikes' | 'clues_remaining' | 'custom';
  direction: 'asc' | 'desc';
  label?: string;
};

export type TiebreakerItem = {
  kind: 'tiebreaker';
  type: 'tie' | 'coin_toss';
};

export type ScoringChainEntry = ObservableItem | UserInputItem | TiebreakerItem;

// Internal version with stable IDs for dnd-kit (chain items only; tiebreaker is separate)
type InternalChainEntry = (ObservableItem | UserInputItem) & { id: string };

export const DEFAULT_SCORING_CHAIN: ScoringChainEntry[] = [
  { kind: 'observable', type: 'score', direction: 'desc' },
  { kind: 'tiebreaker', type: 'tie' },
];

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

// max_score is a boolean (score == max_score → 1, else → 0). It is mutually
// exclusive with all other chain entries and always sorts descending.
const BOOLEAN_OBSERVABLE_TYPES: ObservableType[] = ['max_score'];
const NUMERIC_OBSERVABLE_TYPES: ObservableType[] = [
  'score',
  'bdr',
  'strikes',
  'clues_remaining',
  'turns',
  'start_time',
  'end_time',
  'elapsed_time',
];
// Enum observables sort by a custom ordering of named values rather than raw number comparison.
// The ranking order is stored as an ordered list of codes in the chain entry (order?: number[]).
const ENUM_OBSERVABLE_TYPES: ObservableType[] = ['end_condition'];

const OBSERVABLE_META: Record<
  ObservableType,
  { label: string; defaultDir: 'asc' | 'desc'; boolean?: true; enum?: true }
> = {
  max_score: { label: 'Max Score', defaultDir: 'desc', boolean: true },
  score: { label: 'Score', defaultDir: 'desc' },
  bdr: { label: 'BDR', defaultDir: 'desc' },
  strikes: { label: 'Strikes', defaultDir: 'asc' },
  clues_remaining: { label: 'Clues Remaining', defaultDir: 'desc' },
  turns: { label: 'Turns', defaultDir: 'asc' },
  start_time: { label: 'Start Time', defaultDir: 'asc' },
  end_time: { label: 'End Time', defaultDir: 'asc' },
  elapsed_time: { label: 'Elapsed Time', defaultDir: 'asc' },
  end_condition: { label: 'End Condition', defaultDir: 'desc', enum: true },
};

// ---------------------------------------------------------------------------
// User Input (preserved — uncomment if unobservable measures are needed)
// ---------------------------------------------------------------------------
// const STANDARD_INPUT_TYPES = ['bdr', 'strikes', 'clues_remaining'] as const;
// type StandardInputType = (typeof STANDARD_INPUT_TYPES)[number];
// const USER_INPUT_META: Record<StandardInputType, { label: string; defaultDir: 'asc' | 'desc' }> = {
//   bdr: { label: 'BDR', defaultDir: 'desc' },
//   strikes: { label: 'Strikes', defaultDir: 'asc' },
//   clues_remaining: { label: 'Clues Remaining', defaultDir: 'desc' },
// };

function entryLabel(entry: ObservableItem | UserInputItem): string {
  if (entry.kind === 'observable') return OBSERVABLE_META[entry.type].label;
  if (entry.type === 'custom') return entry.label || 'Custom';
  // Fallback for legacy user_input entries stored before BDR/Strikes/Clues became observable
  const legacyLabels: Record<string, string> = {
    bdr: 'BDR',
    strikes: 'Strikes',
    clues_remaining: 'Clues Remaining',
  };
  return legacyLabels[entry.type] ?? entry.type;
}

let _idCounter = 0;
function nextId(): string {
  return `sce-${++_idCounter}`;
}

function toInternal(entries: ScoringChainEntry[]): InternalChainEntry[] {
  return entries
    .filter((e): e is ObservableItem | UserInputItem => e.kind !== 'tiebreaker')
    .map((e) => ({ ...e, id: nextId() }));
}

function toStorable(entries: InternalChainEntry[]): (ObservableItem | UserInputItem)[] {
  return entries.map((e) => {
    const copy = { ...e } as Record<string, unknown>;
    delete copy['id'];
    return copy as ObservableItem | UserInputItem;
  });
}

// ---------------------------------------------------------------------------
// Sortable row
// ---------------------------------------------------------------------------

function endConditionLabel(code: number): string {
  return END_CONDITIONS.find((e) => e.code === code)?.label ?? `Code ${code}`;
}

function SortableRow({
  entry,
  onRemove,
  onSetDirection,
  onSetOrder,
  onLabelChange,
}: {
  entry: InternalChainEntry;
  onRemove: () => void;
  onSetDirection: (dir: 'asc' | 'desc') => void;
  onSetOrder: (order: number[]) => void;
  onLabelChange: (label: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
  });
  const [orderExpanded, setOrderExpanded] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const isCustom = entry.kind === 'user_input' && entry.type === 'custom';
  const isBoolean =
    entry.kind === 'observable' && OBSERVABLE_META[entry.type as ObservableType]?.boolean === true;
  const isEnum =
    entry.kind === 'observable' && OBSERVABLE_META[entry.type as ObservableType]?.enum === true;
  const badgeColor = entry.kind === 'observable' ? (isEnum ? 'violet' : 'blue') : 'orange';
  const badgeLabel = entry.kind === 'observable' ? (isEnum ? 'Enum' : 'Obs') : 'Input';

  const currentOrder: number[] =
    isEnum && entry.kind === 'observable' && (entry as ObservableItem).order
      ? (entry as ObservableItem).order!
      : DEFAULT_END_CONDITION_ORDER;

  function moveCode(index: number, direction: -1 | 1) {
    const next = [...currentOrder];
    const swapIdx = index + direction;
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    onSetOrder(next);
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{
          padding: '4px 6px',
          border: '1px solid var(--mantine-color-gray-2)',
          borderRadius: 6,
          background: 'var(--mantine-color-gray-0)',
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          style={{
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--mantine-color-gray-5)',
            touchAction: 'none',
          }}
        >
          <MaterialIcon name="drag_indicator" />
        </div>

        {/* Kind badge */}
        <Badge
          size="xs"
          color={badgeColor}
          variant="light"
          style={{ flexShrink: 0, minWidth: 40, textAlign: 'center' }}
        >
          {badgeLabel}
        </Badge>

        {/* Label / editable label */}
        <div style={{ flex: 1, minWidth: 60 }}>
          {isCustom ? (
            <TextInput
              value={(entry as UserInputItem & { id: string }).label ?? ''}
              onChange={(e) => onLabelChange(e.currentTarget.value)}
              placeholder="Label"
              size="xs"
            />
          ) : (
            <Text size="sm">{entryLabel(entry)}</Text>
          )}
        </div>

        {/* Direction toggle — hidden for boolean and enum observables */}
        {!isBoolean && !isEnum ? (
          <Group gap={2} wrap="nowrap">
            <Button
              size="xs"
              variant={entry.direction === 'asc' ? 'filled' : 'default'}
              onClick={() => onSetDirection('asc')}
            >
              ↑ Asc
            </Button>
            <Button
              size="xs"
              variant={entry.direction === 'desc' ? 'filled' : 'default'}
              onClick={() => onSetDirection('desc')}
            >
              ↓ Desc
            </Button>
          </Group>
        ) : isBoolean ? (
          <Text size="xs" c="dimmed" style={{ paddingRight: 4 }}>
            achieved &gt; not
          </Text>
        ) : (
          /* Enum: show compact order summary + expand toggle */
          <Group gap={4} wrap="nowrap" align="center">
            <Text size="xs" c="dimmed">
              {currentOrder.slice(0, 3).map(endConditionLabel).join(' > ')}
              {currentOrder.length > 3 ? '…' : ''}
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="violet"
              onClick={() => setOrderExpanded((v) => !v)}
              aria-label="Edit order"
            >
              <MaterialIcon name={orderExpanded ? 'expand_less' : 'sort'} />
            </ActionIcon>
          </Group>
        )}

        {/* Remove */}
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onRemove} aria-label="Remove">
          <MaterialIcon name="close" />
        </ActionIcon>
      </Group>

      {/* Enum order editor — inline expansion */}
      {isEnum && orderExpanded && (
        <Stack
          gap={2}
          style={{
            marginTop: 4,
            padding: '6px 8px',
            border: '1px solid var(--mantine-color-violet-2)',
            borderRadius: 6,
            background: 'var(--mantine-color-violet-0)',
          }}
        >
          <Text size="xs" c="dimmed" fw={600} mb={2}>
            Rank order (best → worst)
          </Text>
          {currentOrder.map((code, index) => (
            <Group key={code} gap={4} wrap="nowrap" align="center">
              <Text size="xs" c="dimmed" style={{ minWidth: 20, textAlign: 'right' }}>
                {index + 1}.
              </Text>
              <Text size="xs" style={{ flex: 1 }}>
                {endConditionLabel(code)}
              </Text>
              <ActionIcon
                size="xs"
                variant="subtle"
                disabled={index === 0}
                onClick={() => moveCode(index, -1)}
                aria-label="Move up"
              >
                <MaterialIcon name="arrow_upward" />
              </ActionIcon>
              <ActionIcon
                size="xs"
                variant="subtle"
                disabled={index === currentOrder.length - 1}
                onClick={() => moveCode(index, 1)}
                aria-label="Move down"
              >
                <MaterialIcon name="arrow_downward" />
              </ActionIcon>
            </Group>
          ))}
          <Button
            size="xs"
            variant="subtle"
            color="violet"
            mt={4}
            onClick={() => setOrderExpanded(false)}
          >
            Done
          </Button>
        </Stack>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type Props = {
  value: ScoringChainEntry[];
  onChange: (value: ScoringChainEntry[]) => void;
};

export function ScoringChainEditor({ value, onChange }: Props) {
  // Tracks the last JSON we emitted so the sync effect can skip our own changes
  const prevJsonRef = useRef('');

  const [chain, setChain] = useState<InternalChainEntry[]>(() => toInternal(value));

  const [resolution, setResolutionState] = useState<'tie' | 'coin_toss'>(() => {
    const tb = value.find((e) => e.kind === 'tiebreaker') as TiebreakerItem | undefined;
    return tb?.type ?? 'tie';
  });

  // Re-sync when value changes from outside (e.g., edit load)
  useEffect(() => {
    const json = JSON.stringify(value);
    if (json === prevJsonRef.current) return;
    prevJsonRef.current = json;
    setChain(toInternal(value));
    const tb = value.find((e) => e.kind === 'tiebreaker') as TiebreakerItem | undefined;
    setResolutionState(tb?.type ?? 'tie');
  }, [value]);

  function emit(newChain: InternalChainEntry[], newRes: 'tie' | 'coin_toss') {
    const storable: ScoringChainEntry[] = [
      ...toStorable(newChain),
      { kind: 'tiebreaker', type: newRes },
    ];
    prevJsonRef.current = JSON.stringify(storable);
    onChange(storable);
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = chain.findIndex((e) => e.id === active.id);
    const newIdx = chain.findIndex((e) => e.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(chain, oldIdx, newIdx);
    setChain(next);
    emit(next, resolution);
  }

  function addObservable(type: ObservableType) {
    const isEnum = OBSERVABLE_META[type].enum === true;
    const entry: InternalChainEntry = {
      id: nextId(),
      kind: 'observable',
      type,
      direction: OBSERVABLE_META[type].defaultDir,
      ...(isEnum ? { order: [...DEFAULT_END_CONDITION_ORDER] } : {}),
    };
    const next = [...chain, entry];
    setChain(next);
    emit(next, resolution);
  }

  // Preserved for future unobservable measures — uncomment alongside the User Input palette section
  // function addStandardInput(type: StandardInputType) {
  //   const entry: InternalChainEntry = {
  //     id: nextId(),
  //     kind: 'user_input',
  //     type,
  //     direction: USER_INPUT_META[type].defaultDir,
  //   };
  //   const next = [...chain, entry];
  //   setChain(next);
  //   emit(next, resolution);
  // }

  // function addCustom() {
  //   const entry: InternalChainEntry = {
  //     id: nextId(),
  //     kind: 'user_input',
  //     type: 'custom',
  //     direction: 'desc',
  //     label: 'Custom',
  //   };
  //   const next = [...chain, entry];
  //   setChain(next);
  //   emit(next, resolution);
  // }

  function removeItem(id: string) {
    const next = chain.filter((e) => e.id !== id);
    setChain(next);
    emit(next, resolution);
  }

  function setDirection(id: string, dir: 'asc' | 'desc') {
    const next = chain.map((e) => (e.id === id ? { ...e, direction: dir } : e));
    setChain(next);
    emit(next, resolution);
  }

  function setOrder(id: string, order: number[]) {
    const next = chain.map((e) => (e.id === id && e.kind === 'observable' ? { ...e, order } : e));
    setChain(next);
    emit(next, resolution);
  }

  function setLabel(id: string, label: string) {
    const next = chain.map((e) =>
      e.id === id && e.kind === 'user_input' && e.type === 'custom' ? { ...e, label } : e,
    );
    setChain(next);
    emit(next, resolution);
  }

  function changeResolution(type: 'tie' | 'coin_toss') {
    setResolutionState(type);
    emit(chain, type);
  }

  // Which palette items are already in the chain (for disabling)
  const inChainObservable = new Set(
    chain.filter((e) => e.kind === 'observable').map((e) => (e as ObservableItem).type),
  );
  // Preserved for future unobservable measures — uncomment alongside the User Input palette section
  // const inChainStandardInput = new Set(
  //   chain
  //     .filter((e) => e.kind === 'user_input' && e.type !== 'custom')
  //     .map((e) => (e as UserInputItem).type),
  // );

  // max_score is mutually exclusive with all other chain entries
  const hasMaxScore = inChainObservable.has('max_score');
  const hasAnyOther = chain.length > 0 && !hasMaxScore;

  return (
    <Stack gap="sm">
      {/* Palette */}
      <Stack gap={6}>
        {/* Boolean / inferrable measures */}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            style={{ minWidth: 72, paddingTop: 4, flexShrink: 0 }}
          >
            Boolean
          </Text>
          <Group gap={4} wrap="wrap">
            {BOOLEAN_OBSERVABLE_TYPES.map((type) => (
              <Button
                key={type}
                size="xs"
                variant="light"
                color="teal"
                disabled={inChainObservable.has(type) || hasAnyOther}
                title={hasAnyOther ? 'Max Score cannot be combined with other measures' : undefined}
                onClick={() => addObservable(type)}
              >
                {OBSERVABLE_META[type].label}
              </Button>
            ))}
          </Group>
        </Group>

        {/* Numeric observable measures */}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            style={{ minWidth: 72, paddingTop: 4, flexShrink: 0 }}
          >
            Observable
          </Text>
          <Group gap={4} wrap="wrap">
            {NUMERIC_OBSERVABLE_TYPES.map((type) => (
              <Button
                key={type}
                size="xs"
                variant="light"
                color="blue"
                disabled={inChainObservable.has(type) || hasMaxScore}
                title={hasMaxScore ? 'Cannot combine with Max Score' : undefined}
                onClick={() => addObservable(type)}
              >
                {OBSERVABLE_META[type].label}
              </Button>
            ))}
          </Group>
        </Group>

        {/* Enum observable measures */}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            style={{ minWidth: 72, paddingTop: 4, flexShrink: 0 }}
          >
            Enum
          </Text>
          <Group gap={4} wrap="wrap">
            {ENUM_OBSERVABLE_TYPES.map((type) => (
              <Button
                key={type}
                size="xs"
                variant="light"
                color="violet"
                disabled={inChainObservable.has(type) || hasMaxScore}
                title={hasMaxScore ? 'Cannot combine with Max Score' : undefined}
                onClick={() => addObservable(type)}
              >
                {OBSERVABLE_META[type].label}
              </Button>
            ))}
          </Group>
        </Group>

        {/* User Input palette — preserved for future use if non-observable measures are needed
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            style={{ minWidth: 72, paddingTop: 4, flexShrink: 0 }}
          >
            User Input
          </Text>
          <Group gap={4} wrap="wrap">
            {STANDARD_INPUT_TYPES.map((type) => (
              <Button
                key={type}
                size="xs"
                variant="light"
                color="orange"
                disabled={inChainStandardInput.has(type) || hasMaxScore}
                title={hasMaxScore ? 'Cannot combine with Max Score' : undefined}
                onClick={() => addStandardInput(type)}
              >
                {USER_INPUT_META[type].label}
              </Button>
            ))}
            <Button
              size="xs"
              variant="light"
              color="orange"
              disabled={hasMaxScore}
              title={hasMaxScore ? 'Cannot combine with Max Score' : undefined}
              onClick={addCustom}
            >
              + Custom
            </Button>
          </Group>
        </Group>
        */}
      </Stack>

      {/* Chain */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={chain.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <Stack gap="xs">
            {chain.length === 0 && (
              <Text size="sm" c="dimmed" fs="italic">
                No criteria yet — click items above to build the ranking chain.
              </Text>
            )}
            {chain.map((entry) => (
              <SortableRow
                key={entry.id}
                entry={entry}
                onRemove={() => removeItem(entry.id)}
                onSetDirection={(dir) => setDirection(entry.id, dir)}
                onSetOrder={(order) => setOrder(entry.id, order)}
                onLabelChange={(label) => setLabel(entry.id, label)}
              />
            ))}
          </Stack>
        </SortableContext>
      </DndContext>

      {/* Final resolution — always present, non-sortable, mutually exclusive */}
      <Group
        gap="xs"
        wrap="nowrap"
        align="center"
        style={{
          padding: '4px 6px',
          border: '1px solid var(--mantine-color-grape-3)',
          borderRadius: 6,
          background: 'var(--mantine-color-grape-0)',
        }}
      >
        <div style={{ width: 20, flexShrink: 0 }} />
        <Badge
          size="xs"
          color="grape"
          variant="light"
          style={{ flexShrink: 0, minWidth: 40, textAlign: 'center' }}
        >
          Final
        </Badge>
        <Text size="sm" style={{ flex: 1 }}>
          Resolution
        </Text>
        <Group gap={2} wrap="nowrap">
          <Button
            size="xs"
            variant={resolution === 'tie' ? 'filled' : 'default'}
            color="grape"
            onClick={() => changeResolution('tie')}
          >
            Tie
          </Button>
          <Button
            size="xs"
            variant={resolution === 'coin_toss' ? 'filled' : 'default'}
            color="grape"
            onClick={() => changeResolution('coin_toss')}
          >
            Coin Toss
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
