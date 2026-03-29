import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactElement,
  TextareaHTMLAttributes,
} from 'react';
import { Box, TextInput as MantineTextInput, Textarea as MantineTextarea } from '../../../mantine';

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

const sizeInputStyles: Record<'sm' | 'md', CSSProperties> = {
  sm: {
    height: 'var(--ds-size-control-sm-height)',
    minHeight: 'var(--ds-size-control-sm-height)',
    padding: '0 var(--ds-size-control-sm-paddingX)',
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
  },
  md: {
    height: 'var(--ds-size-control-md-height)',
    minHeight: 'var(--ds-size-control-md-height)',
    padding: '0 var(--ds-size-control-md-paddingX)',
  },
};

// TextareaAutosize throws if style.minHeight is set — use padding-only styles for multiline.
const sizeTextareaStyles: Record<'sm' | 'md', CSSProperties> = {
  sm: {
    padding: '0 var(--ds-size-control-sm-paddingX)',
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
  },
  md: {
    padding: '0 var(--ds-size-control-md-paddingX)',
  },
};

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

  const inputStyle: CSSProperties = {
    ...sizeInputStyles[size],
    width: fullWidth ? '100%' : undefined,
  };

  const textareaStyle: CSSProperties = {
    ...sizeTextareaStyles[size],
    width: fullWidth ? '100%' : undefined,
  };

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
          className={className}
          error={hasError}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          styles={{ input: textareaStyle }}
          {...(rest as TextAreaProps)}
        />
      ) : (
        <MantineTextInput
          id={inputId}
          className={className}
          error={hasError}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          styles={{ input: inputStyle, section: { display: 'none' } }}
          {...(rest as TextInputProps)}
        />
      )}
      {hasError ? (
        <Box
          id={describedBy}
          component="span"
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-error-text)',
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
