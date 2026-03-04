import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pill, Tooltip, CoreBox as Box, CoreText as Text } from '../../../design-system';
import { parseRoundSeedPayload } from './textAndSeedUtils';
import type { SessionRound, RoundStatus } from './types';

function SpinnerGlyph() {
  return (
    <Box
      aria-hidden
      style={{
        display: 'inline-block',
        width: '0.75rem',
        height: '0.75rem',
        borderRadius: '9999px',
        border: '2px solid currentColor',
        borderTopColor: 'transparent',
        opacity: 0.85,
        animation: 'ds-rotate 0.7s linear infinite',
      }}
    />
  );
}

function gameStatusIcon(status: RoundStatus) {
  if (status === 'finalized') return '✓';
  if (status === 'pending') return null;
  return <SpinnerGlyph />;
}

export function SortableQueuedRoundPill(props: {
  round: SessionRound;
  draggingRoundId: number | null;
}) {
  const { round, draggingRoundId } = props;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: round.id,
  });

  const seed = parseRoundSeedPayload(round.seed_payload);
  const variantDisplay = seed.variant.replace(/\s*\(#\d+\)\s*$/, '').trim();
  const pillLabel = seed.seed || `Game ${round.round_index}`;

  const pill = (
    <Pill
      size="sm"
      variant="default"
      interactive
      style={{
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        msUserSelect: 'none',
      }}
    >
      {pillLabel}
    </Pill>
  );

  return (
    <Box
      ref={setNodeRef}
      style={{
        width: '100%',
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
      }}
      {...attributes}
      {...listeners}
    >
      {draggingRoundId != null ? (
        pill
      ) : (
        <Tooltip content={`Variant: ${variantDisplay || 'N/A'}\nSeed: ${seed.seed || 'N/A'}`}>
          {pill}
        </Tooltip>
      )}
    </Box>
  );
}

export function StaticRoundPill(props: { round: SessionRound }) {
  const { round } = props;
  const seed = parseRoundSeedPayload(round.seed_payload);
  const variantDisplay = seed.variant.replace(/\s*\(#\d+\)\s*$/, '').trim();
  const pillLabel = seed.seed || `Game ${round.round_index}`;
  const statusIcon = gameStatusIcon(round.status);
  return (
    <Tooltip content={`Variant: ${variantDisplay || 'N/A'}\nSeed: ${seed.seed || 'N/A'}`}>
      <Pill
        size="sm"
        variant="default"
        style={{
          opacity: 0.74,
        }}
      >
        {pillLabel}
        {statusIcon ? (
          <Text span style={{ marginLeft: '0.4rem' }}>
            {statusIcon}
          </Text>
        ) : null}
      </Pill>
    </Tooltip>
  );
}
