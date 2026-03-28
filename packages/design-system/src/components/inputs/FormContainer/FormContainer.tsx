import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type FormContainerProps = {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
};

const gapMap: Record<'xs' | 'sm' | 'md' | 'lg', string> = {
  xs: 'var(--ds-space-xxs)',
  sm: 'var(--ds-space-xs)',
  md: 'var(--ds-space-sm)',
  lg: 'var(--ds-space-md)',
};

/**
 * FormContainer
 * Establishes consistent spacing between form sections, labels, help text, and actions.
 */
export function FormContainer({
  children,
  gap = 'md',
  className,
}: FormContainerProps): ReactElement {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: gapMap[gap],
  };

  return (
    <Box className={className} style={style}>
      {children}
    </Box>
  );
}
