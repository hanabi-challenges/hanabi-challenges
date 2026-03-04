import type { InputHTMLAttributes, ReactElement } from 'react';
import { Radio as MantineRadio } from '../../../../mantine';
import './Radio.css';

export type RadioProps = {
  label?: string;
  helperText?: string;
  error?: string | null;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function Radio({
  label,
  helperText,
  error,
  className,
  id,
  ...rest
}: RadioProps): ReactElement {
  return (
    <MantineRadio
      id={id}
      className={['ds-radio-field', className].filter(Boolean).join(' ')}
      label={label}
      description={helperText}
      error={error ?? undefined}
      {...rest}
    />
  );
}
