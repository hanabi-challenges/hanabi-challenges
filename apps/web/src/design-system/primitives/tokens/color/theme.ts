// frontend/src/design-system/primitives/tokens/color/theme.ts
export const colorTheme = {
  light: {
    surface: '#ffffff',
    surfaceMuted: '#f6f8fb',
    text: '#0f172a',
    textMuted: '#475569',
    border: 'rgba(0, 0, 0, 0.06)',
    accentWeak: '#e0e7ff',
    accentStrong: '#1d4ed8',
  },
  dark: {
    surface: '#111827',
    surfaceMuted: '#1f2937',
    text: '#f8fafc',
    textMuted: '#cbd5e1',
    border: 'rgba(255, 255, 255, 0.08)',
    accentWeak: '#1e40af',
    accentStrong: '#93c5fd',
  },
} as const;
