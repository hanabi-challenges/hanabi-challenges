// frontend/src/design-system/primitives/tokens/motion.ts
export const motion = {
  duration: {
    instant: '50ms',
    fast: '120ms',
    normal: '180ms',
    slow: '250ms',
    slower: '320ms',
  },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.2, 0, 0, 1.2)',
    decelerate: 'cubic-bezier(0, 0, 0, 1)',
    accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const;
