// frontend/src/design-system/primitives/tokens/size.ts
import { space } from './space.ts';

export const size = {
  /**
   * Canonical sizing for interactive rectangular controls:
   * buttons, text inputs, select triggers, etc.
   *
   * - height: the physical height of the control itself
   * - paddingX: horizontal padding inside the control
   * - footprint: the vertical real estate the control claims in layout;
   *   used by wrappers (e.g., checkbox rows) to align with other controls.
   */
  control: {
    sm: {
      height: '28px',
      paddingX: space.xs, // 8px
      footprint: '28px',
    },
    md: {
      height: '32px',
      paddingX: space.sm, // 12px
      footprint: '32px',
    },
    lg: {
      height: '40px',
      paddingX: space.md, // 16px
      footprint: '40px',
    },
  },

  /**
   * Pills: chips, tags, filters, status labels, player-name capsules, etc.
   *
   * These are generally smaller than full controls but should still feel
   * consistent with the control scale.
   */
  pill: {
    sm: {
      height: '20px',
      paddingX: space.xs, // 8px
    },
    md: {
      height: '24px',
      paddingX: '10px', // between xs (8) and sm (12), tuned by eye
    },
    lg: {
      height: '28px',
      paddingX: space.sm, // 12px
    },
  },

  /**
   * Table row heights: used for data grids / lists.
   *
   * These are defined in terms of the control footprints so that
   * embedding controls in rows does not distort the table.
   */
  tableRow: {
    dense: '28px', // aligns with control.sm.footprint
    regular: '32px', // aligns with control.md.footprint
    relaxed: '40px', // aligns with control.lg.footprint (future-friendly)
  },
} as const;

export type SizeTokens = typeof size;
