import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './InputContainer.css';

type InputContainerProps = {
  label?: string;
  helperText?: string;
  error?: string | null;
  children: ReactNode;
  className?: string;
  labelAction?: ReactNode;
};

/**
 * InputContainer
 * Wraps a label + control + helper/error text with standardized spacing and alignment.
 */
export function InputContainer({
  label,
  helperText,
  error,
  children,
  className,
  labelAction,
}: InputContainerProps): ReactElement {
  const hasError = Boolean(error);
  return (
    <Box className={['ds-input-container', className].filter(Boolean).join(' ')}>
      {label && (
        <Box className="ds-input-container__label-row">
          <Box className="ds-input-container__label">{label}</Box>
          {labelAction}
        </Box>
      )}
      <Box
        className={[
          'ds-input-container__control',
          hasError ? 'ds-input-container__control--error' : undefined,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {children}
      </Box>
      {hasError ? (
        <Box className="ds-input-container__helper ds-input-container__helper--error">{error}</Box>
      ) : helperText ? (
        <Box className="ds-input-container__helper">{helperText}</Box>
      ) : null}
    </Box>
  );
}
