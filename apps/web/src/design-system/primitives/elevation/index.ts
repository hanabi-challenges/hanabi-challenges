// frontend/src/design-system/primitives/elevation/index.ts
import { tokens } from '../tokens/index.ts';

/**
 * Elevation levels combine shadow + zIndex into
 * a small, semantic set of “heights” in the interface.
 */
export const elevation = {
  none: {
    shadow: 'none',
    zIndex: tokens.zIndex.base,
  },

  /**
   * Subtle raised surfaces: cards, panels, inset sections.
   */
  raised: {
    shadow: tokens.shadow.light,
    zIndex: tokens.zIndex.base,
  },

  /**
   * Hovered or active raised surfaces: hovered cards / tiles.
   */
  raisedHover: {
    shadow: tokens.shadow.hover,
    zIndex: tokens.zIndex.base,
  },

  /**
   * Overlays that sit above the main page content.
   * e.g. dropdowns, popovers, small floating panels.
   */
  overlay: {
    shadow: tokens.shadow.hover,
    zIndex: tokens.zIndex.overlay,
  },

  /**
   * Modal dialogs and sheets – highest “blocking” surfaces.
   */
  modal: {
    shadow: tokens.shadow.modal,
    zIndex: tokens.zIndex.modal,
  },

  /**
   * Toast notifications or global status banners.
   */
  toast: {
    shadow: tokens.shadow.modal,
    zIndex: tokens.zIndex.toast,
  },
} as const;

export type Elevation = typeof elevation;
