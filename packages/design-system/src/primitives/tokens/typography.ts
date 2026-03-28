// frontend/src/design-system/primitives/tokens/typography.ts
export const typography = {
  fontFamily: {
    display: '"Inter", sans-serif',
    heading: '"Inter", sans-serif',
    body: '"Inter", sans-serif',
    prose: '"Lora", serif',
    mono: '"Roboto Mono", monospace',
    meta: '"Inter", sans-serif',
  },

  fontWeight: {
    display: 800, // matches your heading/title weight
    heading: 700,
    body: 500,
    prose: 500,
    mono: 400,
    meta: 400,
  },

  // Category-based line heights (your chosen structure)
  lineHeight: {
    tight: 1.2, // display + headings
    normal: 1.4, // body
    relaxed: 1.6, // prose
  },

  // Letter spacing defaults
  letterSpacing: {
    normal: '0',
  },
} as const;

export type Typography = typeof typography;
