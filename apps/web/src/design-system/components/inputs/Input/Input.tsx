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
  const sizeClass = size === 'sm' ? 'ds-input--sm' : 'ds-input--md';
  const widthClass = fullWidth ? 'ds-input--full' : '';
  const errorClass = hasError ? 'ds-input--error' : '';
  const inputClasses = ['ds-input', sizeClass, widthClass, errorClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Box component="label" className="ds-input-field">
      {(label || labelAction) && (
        <Box className="ds-input-label-row">
          {label && (
            <Box className="ds-input-label" component="span">
              {label}
            </Box>
          )}
          {labelAction}
        </Box>
      )}
      {multiline ? (
        <MantineTextarea
          id={inputId}
          classNames={{ input: inputClasses }}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          {...(rest as TextAreaProps)}
        />
      ) : (
        <MantineTextInput
          id={inputId}
          classNames={{ input: inputClasses }}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          styles={{ input: { width: '100%' }, section: { display: 'none' } }}
          {...(rest as TextInputProps)}
        />
      )}
      {hasError ? (
        <Box id={describedBy} className="ds-input-helper ds-input-helper--error" component="span">
          {error}
        </Box>
      ) : helperText ? (
        <Box id={describedBy} className="ds-input-helper" component="span">
          {helperText}
        </Box>
      ) : null}
    </Box>
  );
}
