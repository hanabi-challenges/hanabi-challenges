// frontend/src/design-system/primitives/tokens/color/semantics.ts
export const colorSemantic = {
  kpiText: {
    positive: {
      onLightSurface: '#529c74',
      onDarkSurface: '#37bb65',
    },
    neutral: {
      onLightSurface: '#df9f37',
      onDarkSurface: '#df9f37',
    },
    negative: {
      onLightSurface: '#b94431',
      onDarkSurface: '#cc2e48',
    },
  },

  alert: {
    success: {
      light: { bg: '#ecfdf3', text: '#2f7456' },
      dark: { bg: '#064e3b', text: '#d1fae5' },
    },
    info: {
      light: { bg: '#eef2ff', text: '#312e81' },
      dark: { bg: '#1e1b4b', text: '#e0e7ff' },
    },
    warning: {
      light: { bg: '#fff7ed', text: '#92400e' },
      dark: { bg: '#431407', text: '#fed7aa' },
    },
    error: {
      light: { bg: '#fef2f2', text: '#b91c1c' },
      dark: { bg: '#7f1d1d', text: '#fecdd3' },
    },
  },
} as const;
