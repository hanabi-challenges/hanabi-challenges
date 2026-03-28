import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type CardContainerProps = {
  children: ReactNode;
  columns?: string;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
};

const gapMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'var(--ds-space-xs)',
  md: 'var(--ds-space-sm)',
  lg: 'var(--ds-space-md)',
};

/**
 * Manages spacing rules for groups of cards (grid layout).
 */
export function CardContainer({
  children,
  columns,
  gap = 'md',
  className,
}: CardContainerProps): ReactElement {
  const style: CSSProperties = {
    display: 'grid',
    width: '100%',
    gap: gapMap[gap],
    ...(columns ? { gridTemplateColumns: columns } : {}),
  };

  return (
    <Box className={className} style={style}>
      {children}
    </Box>
  );
}
