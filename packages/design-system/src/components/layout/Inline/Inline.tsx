// src/design-system/components/layout/Inline/Inline.tsx
import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

export type InlineGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';
export type InlineAlign = 'start' | 'center' | 'end' | 'baseline';
export type InlineJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';

export type InlineProps = {
  children: ReactNode;

  /**
   * Horizontal spacing between children.
   * Implemented via CSS gap using your spacing scale.
   */
  gap?: InlineGap;

  /**
   * Cross-axis alignment (maps to align-items).
   */
  align?: InlineAlign;

  /**
   * Main-axis distribution (maps to justify-content).
   */
  justify?: InlineJustify;

  /**
   * Allow items to wrap onto multiple lines when they overflow.
   */
  wrap?: boolean;

  /**
   * Optional explicit column widths. When provided, Inline switches to CSS grid
   * and applies these widths to columns. Numbers are treated as proportional
   * fractions (e.g., [1, 2, 2] -> "1fr 2fr 2fr"); strings are used as-is (e.g., "20%", "2fr", "120px").
   */
  columnWidths?: Array<string | number>;

  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>;

const gapMap: Record<InlineGap, string> = {
  none: '0',
  xs: 'var(--ds-space-xs)',
  sm: 'var(--ds-space-sm)',
  md: 'var(--ds-space-md)',
  lg: 'var(--ds-space-lg)',
};

const alignMap: Record<InlineAlign, CSSProperties['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  baseline: 'baseline',
};

const justifyMap: Record<InlineJustify, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
  'space-around': 'space-around',
  'space-evenly': 'space-evenly',
};

export function Inline({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'start',
  wrap = false,
  columnWidths,
  className,
  style,
  ...rest
}: InlineProps & { style?: CSSProperties }): ReactElement {
  const gridTemplate =
    columnWidths && columnWidths.length > 0
      ? columnWidths
          .map((w) => {
            if (typeof w === 'number') return `${w}fr`;
            const numeric = Number(w);
            return Number.isFinite(numeric) ? `${numeric}fr` : w;
          })
          .join(' ')
      : undefined;

  const inlineStyle: CSSProperties = {
    display: gridTemplate ? 'grid' : 'flex',
    flexDirection: gridTemplate ? undefined : 'row',
    gap: gapMap[gap],
    alignItems: alignMap[align],
    justifyContent: justifyMap[justify],
    ...(wrap && !gridTemplate ? { flexWrap: 'wrap' } : {}),
    ...(gridTemplate ? { gridTemplateColumns: gridTemplate } : {}),
    ...style,
  };

  return (
    <Box className={className} style={inlineStyle} {...rest}>
      {children}
    </Box>
  );
}
