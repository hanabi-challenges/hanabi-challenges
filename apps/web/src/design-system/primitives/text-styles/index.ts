// frontend/src/design-system/primitives/text-styles/index.ts
import { tokens } from '../tokens/index.ts';

type TextStyle = {
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: number;
  letterSpacing?: string;
  textTransform?: 'uppercase' | 'none';
};

// Convenience helper to pull from the text scale
const fromScale = (
  step: keyof typeof tokens.textScale,
): Pick<TextStyle, 'fontSize' | 'lineHeight'> => ({
  fontSize: tokens.textScale[step].fontSize,
  lineHeight: tokens.textScale[step].lineHeight,
});

// Families:
// - display: md, sm
// - heading: lg, md, sm, xs
// - body: lg, md, sm, xs
// - prose: md, sm  (same sizes as body, but more relaxed line-height)
// - code: md, sm
// - meta: lg, md, sm, xs

export const textStyles = {
  //
  // Display: largest, for big page titles / hero text.
  //
  display: {
    sm: {
      fontFamily: tokens.typography.fontFamily.display,
      fontWeight: tokens.typography.fontWeight.display,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(10), // 34px
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.display,
      fontWeight: tokens.typography.fontWeight.display,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(11), // 40px
    } satisfies TextStyle,
  },

  //
  // Heading: structured section headings in UI.
  //
  heading: {
    xs: {
      fontFamily: tokens.typography.fontFamily.heading,
      fontWeight: tokens.typography.fontWeight.heading,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(7), // 20px
    } satisfies TextStyle,
    sm: {
      fontFamily: tokens.typography.fontFamily.heading,
      fontWeight: tokens.typography.fontWeight.heading,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(8), // 24px
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.heading,
      fontWeight: tokens.typography.fontWeight.heading,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(9), // 28px
    } satisfies TextStyle,
    lg: {
      fontFamily: tokens.typography.fontFamily.heading,
      fontWeight: tokens.typography.fontWeight.heading,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(10), // 34px
    } satisfies TextStyle,
  },

  //
  // Body: default UI text.
  //
  body: {
    xs: {
      fontFamily: tokens.typography.fontFamily.body,
      fontWeight: tokens.typography.fontWeight.body,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(4), // 14px
    } satisfies TextStyle,
    sm: {
      fontFamily: tokens.typography.fontFamily.body,
      fontWeight: tokens.typography.fontWeight.body,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(5), // 16px
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.body,
      fontWeight: tokens.typography.fontWeight.body,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(6), // 18px
    } satisfies TextStyle,
    lg: {
      fontFamily: tokens.typography.fontFamily.body,
      fontWeight: tokens.typography.fontWeight.body,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(7), // 20px
    } satisfies TextStyle,
  },

  //
  // Prose: long-form reading text.
  // Uses the same sizes as body but with more relaxed line-height.
  //
  prose: {
    sm: {
      fontFamily: tokens.typography.fontFamily.prose,
      fontWeight: tokens.typography.fontWeight.prose,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      fontSize: tokens.textScale[5].fontSize, // 16px
      lineHeight: tokens.typography.lineHeight.relaxed,
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.prose,
      fontWeight: tokens.typography.fontWeight.prose,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      fontSize: tokens.textScale[6].fontSize, // 18px
      lineHeight: tokens.typography.lineHeight.relaxed,
    } satisfies TextStyle,
  },

  //
  // Code: monospace text, for seeds / technical values / code blocks.
  //
  code: {
    sm: {
      fontFamily: tokens.typography.fontFamily.mono,
      fontWeight: tokens.typography.fontWeight.mono,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(5), // 16px
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.mono,
      fontWeight: tokens.typography.fontWeight.mono,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(6), // 18px
    } satisfies TextStyle,
  },

  //
  // Meta: labels, captions, tooltips, axis labels, microcopy.
  //
  meta: {
    xs: {
      fontFamily: tokens.typography.fontFamily.meta,
      fontWeight: tokens.typography.fontWeight.meta,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(1), // 8px
    } satisfies TextStyle,
    sm: {
      fontFamily: tokens.typography.fontFamily.meta,
      fontWeight: tokens.typography.fontWeight.meta,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(2), // 10px
    } satisfies TextStyle,
    md: {
      fontFamily: tokens.typography.fontFamily.meta,
      fontWeight: tokens.typography.fontWeight.meta,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(3), // 12px
    } satisfies TextStyle,
    lg: {
      fontFamily: tokens.typography.fontFamily.meta,
      fontWeight: tokens.typography.fontWeight.meta,
      letterSpacing: tokens.typography.letterSpacing.normal,
      textTransform: 'none',
      ...fromScale(4), // 14px
    } satisfies TextStyle,
  },
} as const;

export type TextStyles = typeof textStyles;
