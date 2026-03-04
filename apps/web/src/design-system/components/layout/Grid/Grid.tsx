import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Grid.css';

export type GridGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';

type GridProps = {
  children: ReactNode;
  columns?: string; // e.g., "repeat(3, minmax(0, 1fr))" or "1fr 2fr"
  gap?: GridGap;
  rowGap?: GridGap;
  colGap?: GridGap;
  className?: string;
  style?: CSSProperties;
};

export function Grid({
  children,
  columns,
  gap = 'md',
  rowGap,
  colGap,
  className,
  style,
}: GridProps): ReactElement {
  const classes = [
    'ds-grid',
    `ds-grid--gap-${gap}`,
    rowGap && `ds-grid--rowgap-${rowGap}`,
    colGap && `ds-grid--colgap-${colGap}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const inlineStyle: CSSProperties = { ...style };
  if (columns) inlineStyle.gridTemplateColumns = columns;

  return (
    <Box className={classes} style={inlineStyle}>
      {children}
    </Box>
  );
}
