// frontend/src/design-system/primitives/tokens/color/index.ts
import { colorTheme } from './theme.ts';
import { colorCategorical } from './categorical.ts';
import { colorScale } from './scale.ts';
import { colorSemantic } from './semantic.ts';

export const color = {
  theme: colorTheme,
  categorical: colorCategorical,
  scale: colorScale,
  semantic: colorSemantic,
} as const;
