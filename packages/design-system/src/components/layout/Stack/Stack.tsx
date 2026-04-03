// frontend/src/design-system/components/layout/Stack/Stack.tsx
import type { CSSProperties, ElementType, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

export type StackGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
export type StackDirection = 'column' | 'row';

export type StackProps = {
  children: ReactNode;
  as?: ElementType;

  /**
   * Spacing between children (maps to CSS gap).
   * Mirrors the same spacing scale as Inline.
   */
  gap?: StackGap;

  /**
   * Cross-axis alignment (align-items).
   * For the default column direction, this is horizontal alignment.
   */
  align?: StackAlign;

  /**
   * Main-axis distribution (justify-content).
   * For the default column direction, this is vertical distribution.
   */
  justify?: StackJustify;

  /**
   * Direction of the stack.
   * Defaults to "column". Prefer Inline for horizontal-only layouts.
   */
  direction?: StackDirection;

  /**
   * Allow items to wrap when direction="row".
   */
  wrap?: boolean;

  className?: string;
  style?: CSSProperties;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children' | 'style'>;

const gapMap: Record<StackGap, string | number> = {
  none: 0,
  xs: 'var(--ds-space-xs)',
  sm: 'var(--ds-space-sm)',
  md: 'var(--ds-space-md)',
  lg: 'var(--ds-space-lg)',
};

const flexAlignMap: Record<StackAlign, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const justifyMap: Record<StackJustify, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
};

export function Stack({
  children,
  as,
  gap = 'sm',
  align = 'stretch',
  justify = 'start',
  direction = 'column',
  wrap = false,
  className,
  style,
  ...rest
}: StackProps): ReactElement {
  return (
    <Box
      component={(as ?? 'div') as 'div'}
      className={className}
      style={{
        display: 'flex',
        flexDirection: direction,
        gap: gapMap[gap],
        alignItems: flexAlignMap[align],
        justifyContent: justifyMap[justify],
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </Box>
  );
}
