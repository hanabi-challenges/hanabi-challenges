// frontend/src/design-system/primitives/tokens/icon.ts
export const icon = {
  size: {
    xs: '12px', // tiny UI / dense tables
    sm: '16px', // default inline icon
    md: '20px', // buttons, primary nav
    lg: '24px', // larger affordances
    xl: '32px', // occasional hero / empty-state
  },

  /**
   * Stroke widths are numeric because they’re typically used
   * inside SVGs rather than in CSS directly.
   */
  strokeWidth: {
    default: 1.5,
    strong: 2,
  },
} as const;

export type IconTokens = typeof icon;
