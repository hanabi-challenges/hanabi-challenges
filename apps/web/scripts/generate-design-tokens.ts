/// <reference types="node" />

// frontend/scripts/generate-design-tokens.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../src/design-system/primitives/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type FlattenedToken = {
  path: string[];
  cssVar: string;
  value: string;
};

/**
 * Convert a token path (["color", "theme", "light", "surface"])
 * into a CSS variable name ("--ds-color-theme-light-surface").
 */
function pathToCssVar(pathParts: string[]): string {
  return `--ds-${pathParts.join('-')}`;
}

/**
 * Recursively flatten a nested token object into an array of
 * { path, cssVar, value } entries.
 */
function flattenTokens(obj: unknown, prefix: string[] = []): FlattenedToken[] {
  if (obj === null || typeof obj !== 'object') return [];
  const entries: FlattenedToken[] = [];

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const currentPath = [...prefix, key];

    if (value !== null && typeof value === 'object') {
      entries.push(...flattenTokens(value, currentPath));
    } else {
      entries.push({
        path: currentPath,
        cssVar: pathToCssVar(currentPath),
        value: String(value),
      });
    }
  }

  return entries;
}

/**
 * Theme aliases for light/dark modes.
 *
 * These map a "friendly" CSS variable (used by components)
 * to the underlying theme-specific variables.
 */
const themeAliasSpecs = [
  {
    alias: '--ds-color-surface',
    lightPath: ['color', 'theme', 'light', 'surface'],
    darkPath: ['color', 'theme', 'dark', 'surface'],
  },
  {
    alias: '--ds-color-surface-muted',
    lightPath: ['color', 'theme', 'light', 'surfaceMuted'],
    darkPath: ['color', 'theme', 'dark', 'surfaceMuted'],
  },
  {
    alias: '--ds-color-text',
    lightPath: ['color', 'theme', 'light', 'text'],
    darkPath: ['color', 'theme', 'dark', 'text'],
  },
  {
    alias: '--ds-color-text-muted',
    lightPath: ['color', 'theme', 'light', 'textMuted'],
    darkPath: ['color', 'theme', 'dark', 'textMuted'],
  },
  {
    alias: '--ds-color-border',
    lightPath: ['color', 'theme', 'light', 'border'],
    darkPath: ['color', 'theme', 'dark', 'border'],
  },
  {
    alias: '--ds-color-accent-weak',
    lightPath: ['color', 'theme', 'light', 'accentWeak'],
    darkPath: ['color', 'theme', 'dark', 'accentWeak'],
  },
  {
    alias: '--ds-color-accent-strong',
    lightPath: ['color', 'theme', 'light', 'accentStrong'],
    darkPath: ['color', 'theme', 'dark', 'accentStrong'],
  },
] as const;

function generateCss(): string {
  const flattened = flattenTokens(tokens);

  const lines: string[] = [];
  lines.push('/* AUTO-GENERATED FROM tokens.ts. DO NOT EDIT BY HAND. */');
  lines.push(':root {');

  // All raw tokens
  for (const entry of flattened) {
    lines.push(`  ${entry.cssVar}: ${entry.value};`);
  }

  // Theme aliases (light as default)
  lines.push('');
  lines.push('  /* Theme aliases (light by default) */');

  for (const spec of themeAliasSpecs) {
    const lightVar = pathToCssVar([...spec.lightPath]);
    lines.push(`  ${spec.alias}: var(${lightVar});`);
  }

  lines.push('}');
  lines.push('');

  // Dark mode overrides for theme aliases
  lines.push(':root.dark {');
  lines.push('  /* Theme aliases overridden for dark mode */');

  for (const spec of themeAliasSpecs) {
    const darkVar = pathToCssVar([...spec.darkPath]);
    lines.push(`  ${spec.alias}: var(${darkVar});`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

function writeCssFile(css: string) {
  const outPath = path.join(__dirname, '../src/design-system/styles/tokens.css');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, css, 'utf8');
  console.log(`✅ Wrote design tokens to ${outPath}`);
}

function main() {
  const css = generateCss();
  writeCssFile(css);
}

main();
