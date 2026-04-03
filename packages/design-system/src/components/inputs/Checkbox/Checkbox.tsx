import type { InputHTMLAttributes, ReactElement } from 'react';
import { Checkbox as MantineCheckbox } from '../../../mantine';

export type CheckboxProps = {
  label?: string;
  helperText?: string;
  error?: string | null;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>;

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
      className={className}
      label={label}
      description={helperText}
      error={error ?? undefined}
      {...rest}
    />
  );
}
