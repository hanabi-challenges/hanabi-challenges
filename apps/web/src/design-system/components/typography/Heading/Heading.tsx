import type { CSSProperties, ElementType, ReactElement, ReactNode } from 'react';
import './Heading.css';
import { textStyles } from '../../../primitives/text-styles';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type HeadingProps<T extends ElementType = 'h2'> = {
  level?: HeadingLevel;
  as?: T;
  children: ReactNode;
  className?: string;
};

/**
 * Heading
 * Semantic text component mapping level to tokenized sizes/weights.
 */
export function Heading<T extends ElementType = 'h2'>({
  level = 2,
  as,
  children,
  className,
}: HeadingProps<T>): ReactElement {
  const Tag = (as || (`h${level}` as ElementType)) as ElementType;
  const classes = ['ds-heading', `ds-heading--${level}`, className].filter(Boolean).join(' ');
  const styleMap = {
    1: textStyles.display.md,
    2: textStyles.heading.lg,
    3: textStyles.heading.md,
    4: textStyles.heading.sm,
    5: textStyles.heading.xs,
    6: textStyles.body.lg,
  } as const;
  const style = styleMap[level] ?? styleMap[2];

  const cssVars: CSSProperties = {
    ['--ds-heading-font-family' as string]: style.fontFamily,
    ['--ds-heading-font-size' as string]: style.fontSize,
    ['--ds-heading-line-height' as string]: style.lineHeight,
    ['--ds-heading-font-weight' as string]: style.fontWeight,
    ['--ds-heading-letter-spacing' as string]: style.letterSpacing ?? 'normal',
  };

  return (
    <Tag className={classes} style={cssVars}>
      {children}
    </Tag>
  );
}
