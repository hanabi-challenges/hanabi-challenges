import type { ReactElement, ReactNode } from 'react';
import { Inline } from '../../layout/Inline/Inline';

type ButtonGroupProps = {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md';
  className?: string;
};

/**
 * ButtonGroup
 * Horizontal arrangement of Buttons with shared spacing styles.
 */
export function ButtonGroup({ children, gap = 'xs', className }: ButtonGroupProps): ReactElement {
  return (
    <Inline gap={gap} align="center" className={className}>
      {children}
    </Inline>
  );
}
