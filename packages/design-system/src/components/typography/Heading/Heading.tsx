import type { ElementType, ReactElement, ReactNode } from 'react';
import { Title } from '../../../mantine';
import { textStyles } from '../../../primitives/text-styles';

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type HeadingProps<T extends ElementType = 'h2'> = {
  level?: HeadingLevel;
  as?: T;
  children: ReactNode;
  className?: string;
};

const styleMap = {
  1: textStyles.display.md,
  2: textStyles.heading.lg,
  3: textStyles.heading.md,
  4: textStyles.heading.sm,
  5: textStyles.heading.xs,
  6: textStyles.body.lg,
} as const;

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
  const style = styleMap[level] ?? styleMap[2];

  return (
    <Title
      order={level}
      component={(as ?? (`h${level}` as ElementType)) as 'h1'}
      className={className}
      style={{
        color: 'var(--ds-color-text)',
        margin: 0,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing ?? 'normal',
      }}
    >
      {children}
    </Title>
  );
}
