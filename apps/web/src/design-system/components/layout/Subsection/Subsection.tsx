import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Subsection.css';

type SubsectionProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Hierarchical spacing variant of Section for nested content blocks.
 */
export function Subsection({ children, className }: SubsectionProps): ReactElement {
  return <Box className={['ds-subsection', className].filter(Boolean).join(' ')}>{children}</Box>;
}
