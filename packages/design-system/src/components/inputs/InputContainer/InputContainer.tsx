import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

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
    <Box
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--ds-space-xxs)',
        width: '100%',
      }}
    >
      {label && (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--ds-space-xs)',
          }}
        >
          <Box
            style={{
              fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
              fontWeight: 600,
              color: 'var(--ds-color-text)',
            }}
          >
            {label}
          </Box>
          {labelAction}
        </Box>
      )}
      <Box
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ds-space-xxs)',
          minHeight: '40px',
          justifyContent: 'center',
          ...(hasError ? { color: 'var(--ds-color-semantic-alert-error-light-text)' } : {}),
        }}
      >
        {children}
      </Box>
      {hasError ? (
        <Box
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-semantic-alert-error-light-text)',
          }}
        >
          {error}
        </Box>
      ) : helperText ? (
        <Box
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-text-muted)',
          }}
        >
          {helperText}
        </Box>
      ) : null}
    </Box>
  );
}
