import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './CardContainer.css';

type CardContainerProps = {
  children: ReactNode;
  columns?: string;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
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
  const classes = ['ds-card-container', `ds-card-container--gap-${gap}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <Box className={classes} style={columns ? { gridTemplateColumns: columns } : undefined}>
      {children}
    </Box>
  );
}
