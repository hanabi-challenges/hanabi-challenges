import type { InputHTMLAttributes, ReactElement } from 'react';
import { Checkbox as MantineCheckbox } from '../../../../mantine';
import './Checkbox.css';

export type CheckboxProps = {
  label?: string;
  helperText?: string;
  error?: string | null;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Checkbox({
  label,
  helperText,
  error,
  className,
  id,
  ...rest
}: CheckboxProps): ReactElement {
  return (
    <MantineCheckbox
      id={id}
      className={['ds-checkbox-field', className].filter(Boolean).join(' ')}
      label={label}
      description={helperText}
      error={error ?? undefined}
      {...rest}
    />
  );
}
