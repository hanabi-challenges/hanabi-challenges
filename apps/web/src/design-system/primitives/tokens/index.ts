// frontend/src/design-system/primitives/index.ts
import { border } from './border.ts';
import { breakpoints } from './breakpoints.ts';
import { color } from './color/index.ts';
import { icon } from './icon.ts';
import { layout } from './layout.ts';
import { motion } from './motion.ts';
import { opacity } from './opacity.ts';
import { radius } from './radius.ts';
import { shadow } from './shadow.ts';
import { size } from './size.ts';
import { space } from './space.ts';
import { textScale } from './textScale.ts';
import { typography } from './typography.ts';
import { zIndex } from './zIndex.ts';

export const tokens = {
  border,
  breakpoints,
  color,
  icon,
  layout,
  motion,
  opacity,
  radius,
  shadow,
  size,
  space,
  textScale,
  typography,
  zIndex,
} as const;

export type Tokens = typeof tokens;
