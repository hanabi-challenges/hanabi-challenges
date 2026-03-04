import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  // 1) Global ignores (replacement for .eslintignore)
  {
    ignores: ['node_modules', 'dist', 'build', 'coverage', 'prettier.config.cjs', '**/*.d.ts', '**/*.d.ts.map'],
  }, // 2) Base JS rules (like "eslint:recommended")
  js.configs.recommended, // 3) TypeScript recommended rules
  ...tseslint.configs.recommended, // 4) Project-specific tweaks
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/src/pages/**/*.{ts,tsx}', 'apps/web/src/features/**/*.{ts,tsx}', 'apps/web/src/layouts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/design-system'],
              importNames: ['CoreCard'],
              message:
                'Use canonical card components (Card, EventCard, AdminEntityCard, AdminLinkCard) instead of CoreCard.',
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      'apps/web/src/pages/admin/AdminEventsIndexPage.tsx',
      'apps/web/src/pages/admin/AdminBadgesIndexPage.tsx',
      'apps/web/src/features/admin/screens/AdminHomeScreen.tsx',
      'apps/web/src/features/admin/screens/content/AdminContentHomeScreen.tsx',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/design-system'],
              importNames: ['Card', 'CoreCard'],
              message:
                'Use canonical admin card subspecies (AdminEntityCard/AdminLinkCard) for consistency and regression safety.',
            },
          ],
        },
      ],
    },
  },
];
