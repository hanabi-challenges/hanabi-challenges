// src/design-system/components/layout/Inline/Inline.tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Inline.css';

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

export function Inline({
  children,
  gap = 'sm',
  align = 'center',
  justify = 'start',
  wrap = false,
  columnWidths,
  className,
  ...rest
}: InlineProps) {
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

  const rootClassName = [
    'ui-inline',
    `ui-inline--gap-${gap}`,
    `ui-inline--align-${align}`,
    `ui-inline--justify-${justify}`,
    wrap && !columnWidths && 'ui-inline--wrap',
    columnWidths && 'ui-inline--grid',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const styleOverrides =
    gridTemplate != null
      ? {
          display: 'grid',
          gridTemplateColumns: gridTemplate,
        }
      : undefined;

  return (
    <Box className={rootClassName} style={styleOverrides} {...rest}>
      {children}
    </Box>
  );
}
