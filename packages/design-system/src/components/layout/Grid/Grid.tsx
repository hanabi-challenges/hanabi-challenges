import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

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

const gapTokenMap: Record<GridGap, string> = {
  none: '0',
  xs: 'var(--ds-space-xxs)',
  sm: 'var(--ds-space-xs)',
  md: 'var(--ds-space-sm)',
  lg: 'var(--ds-space-md)',
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
  const inlineStyle: CSSProperties = {
    display: 'grid',
    width: '100%',
    gap: gapTokenMap[gap],
    ...(rowGap ? { rowGap: gapTokenMap[rowGap] } : {}),
    ...(colGap ? { columnGap: gapTokenMap[colGap] } : {}),
    ...(columns ? { gridTemplateColumns: columns } : {}),
    ...style,
  };

  return (
    <Box className={className} style={inlineStyle}>
      {children}
    </Box>
  );
}
