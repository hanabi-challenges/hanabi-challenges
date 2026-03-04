import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './FormContainer.css';

type FormContainerProps = {
  children: ReactNode;
  gap?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
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
  return (
    <Box className={['ds-form', `ds-form--gap-${gap}`, className].filter(Boolean).join(' ')}>
      {children}
    </Box>
  );
}
