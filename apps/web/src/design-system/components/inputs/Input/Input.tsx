import type { InputHTMLAttributes, TextareaHTMLAttributes, ReactElement } from 'react';
import {
  Box,
  TextInput as MantineTextInput,
  Textarea as MantineTextarea,
} from '../../../../mantine';
import './Input.css';

type BaseProps = {
  label?: string;
  labelAction?: ReactElement | ReactElement[] | null;
  helperText?: string;
  error?: string | null;
  size?: 'md' | 'sm';
  fullWidth?: boolean;
  className?: string;
  id?: string;
};

type TextInputProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    multiline?: false;
  };

type TextAreaProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> & {
    multiline: true;
    rows?: number;
  };

export type InputProps = TextInputProps | TextAreaProps;

export function Input(props: InputProps): ReactElement {
  const {
    label,
    labelAction,
    helperText,
    error,
    size = 'md',
    fullWidth = false,
    className,
    id,
    multiline,
    ...rest
  } = props;

  const inputId =
    id ?? (label ? `ds-input-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;
  const hasError = Boolean(error);

  return (
    <Box
      component="label"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--ds-space-xxs)',
        width: '100%',
      }}
    >
      {(label || labelAction) && (
        <Box
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--ds-space-xs)',
          }}
        >
          {label && (
            <Box
              component="span"
              style={{
                fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
                fontWeight: 600,
                color: 'var(--ds-color-text)',
              }}
            >
              {label}
            </Box>
          )}
          {labelAction}
        </Box>
      )}
      {multiline ? (
        <MantineTextarea
          id={inputId}
          classNames={{
            input: `ds-input ds-input--${size}${fullWidth ? ' ds-input--full' : ''}${hasError ? ' ds-input--error' : ''}${className ? ` ${className}` : ''}`,
          }}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          {...(rest as TextAreaProps)}
        />
      ) : (
        <MantineTextInput
          id={inputId}
          classNames={{
            input: `ds-input ds-input--${size}${fullWidth ? ' ds-input--full' : ''}${hasError ? ' ds-input--error' : ''}${className ? ` ${className}` : ''}`,
          }}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          styles={{ input: { width: '100%' }, section: { display: 'none' } }}
          {...(rest as TextInputProps)}
        />
      )}
      {hasError ? (
        <Box
          id={describedBy}
          component="span"
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-semantic-alert-error-light-text, #b91c1c)',
          }}
        >
          {error}
        </Box>
      ) : helperText ? (
        <Box
          id={describedBy}
          component="span"
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
