// frontend/src/design-system/primitives/mixins/index.ts
import { tokens } from '../tokens/index.ts';

// 1. Accessibility: visually hidden content (screen reader only)
export const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

// 2. Focus ring styling (semantic and token-driven)
export const focusRing = {
  outline: `${tokens.border.width.thick} ${tokens.border.style.solid} ${tokens.color.semantic.alert.info.light.text}`,
  outlineOffset: '2px',
  transition: `outline ${tokens.motion.duration.fast} ${tokens.motion.easing.emphasized}`,
} as const;

// 3. Text truncation (single-line)
export const truncate = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

// 4. Fill parent container (positioning)
export const fill = {
  position: 'absolute',
  inset: 0,
} as const;
