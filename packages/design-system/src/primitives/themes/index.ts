// frontend/src/design-system/primitives/themes/index.ts
import { tokens } from '../tokens/index.ts';

// Light mode theme
export const lightThemeVariables = {
  '--ds-color-surface': tokens.color.theme.light.surface,
  '--ds-color-surface-muted': tokens.color.theme.light.surfaceMuted,
  '--ds-color-text': tokens.color.theme.light.text,
  '--ds-color-text-muted': tokens.color.theme.light.textMuted,
  '--ds-color-border': tokens.color.theme.light.border,
  '--ds-color-accent-weak': tokens.color.theme.light.accentWeak,
  '--ds-color-accent-strong': tokens.color.theme.light.accentStrong,
} as const;

// Dark mode theme
export const darkThemeVariables = {
  '--ds-color-surface': tokens.color.theme.dark.surface,
  '--ds-color-surface-muted': tokens.color.theme.dark.surfaceMuted,
  '--ds-color-text': tokens.color.theme.dark.text,
  '--ds-color-text-muted': tokens.color.theme.dark.textMuted,
  '--ds-color-border': tokens.color.theme.dark.border,
  '--ds-color-accent-weak': tokens.color.theme.dark.accentWeak,
  '--ds-color-accent-strong': tokens.color.theme.dark.accentStrong,
} as const;

/**
 * Generate a CSS string containing the theme variables
 * wrapped in the appropriate selector.
 */
export const generateThemeCSS = (theme: 'light' | 'dark') => {
  const vars = theme === 'light' ? lightThemeVariables : darkThemeVariables;

  const body = Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join('\n');

  return `:root[data-theme="${theme}"] {\n${body}\n}`;
};
