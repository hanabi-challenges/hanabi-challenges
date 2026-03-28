// frontend/src/design-system/primitives/grid/index
import { tokens } from '../tokens/index.ts';

/**
 * Grid system primitives.
 *
 * These do NOT render anything – they define the layout rules
 * the rest of the system should follow.
 */
export const grid = {
  /**
   * Base spatial unit for aligning elements.
   * We use the smallest spacing token (4px) as the baseline grid.
   */
  baseUnit: tokens.space.xxs, // "4px"

  /**
   * Default column count for page layouts.
   * Components are free to use fewer columns locally if needed.
   */
  columns: {
    default: 12,
  },

  /**
   * Horizontal gutter between columns at different breakpoints.
   * These are suggestions for page-level layout, not hard requirements.
   */
  gutter: {
    xs: tokens.space.xs, // 8px
    sm: tokens.space.sm, // 12px
    md: tokens.space.md, // 16px
    lg: tokens.space.lg, // 20px
    xl: tokens.space.lg, // 20px
  },

  /**
   * Recommended max widths for primary layout containers.
   * These are derived from existing layout tokens + breakpoints.
   */
  containerWidth: {
    narrow: tokens.layout.maxWidth.narrow, // e.g. 640px
    panel: tokens.layout.maxWidth.panel, // e.g. 720px
    page: tokens.layout.maxWidth.page, // e.g. 1100px
  },
} as const;

export type Grid = typeof grid;
