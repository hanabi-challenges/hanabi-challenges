// frontend/src/design-system/primitives/tokens/motion/index.ts
import { tokens } from '../tokens/index.ts';

/**
 * Semantic motion patterns built from raw motion tokens.
 *
 * These do not themselves apply animation – they just specify
 * duration + easing combinations that components can plug into
 * CSS transitions or keyframes.
 */
export const motion = {
  /**
   * Generic fade-in for small UI elements (chips, tags, badges).
   */
  fadeIn: {
    duration: tokens.motion.duration.normal,
    easing: tokens.motion.easing.decelerate,
  },

  /**
   * Generic fade-out counterpart.
   */
  fadeOut: {
    duration: tokens.motion.duration.normal,
    easing: tokens.motion.easing.accelerate,
  },

  /**
   * Scale-in for dialogs, popovers, and overlays.
   * Typically combined with a small translate / opacity animation.
   */
  scaleIn: {
    duration: tokens.motion.duration.normal,
    easing: tokens.motion.easing.decelerate,
  },

  /**
   * Subtle hover transitions for buttons, cards, and interactive elements.
   */
  hover: {
    duration: tokens.motion.duration.fast,
    easing: tokens.motion.easing.standard,
  },

  /**
   * Focus ring or outline transitions – pairs with the focusRing mixin.
   */
  focusRing: {
    duration: tokens.motion.duration.fast,
    easing: tokens.motion.easing.emphasized,
  },
} as const;

export type MotionPatterns = typeof motion;
