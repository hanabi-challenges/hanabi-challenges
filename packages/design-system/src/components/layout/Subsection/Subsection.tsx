import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type SubsectionProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Hierarchical spacing variant of Section for nested content blocks.
 */
export function Subsection({ children, className }: SubsectionProps): ReactElement {
  return (
    <Box
      className={className}
      style={{
        paddingTop: 'var(--ds-space-sm)',
        paddingBottom: 'var(--ds-space-sm)',
      }}
    >
      {children}
    </Box>
  );
}
