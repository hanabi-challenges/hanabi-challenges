import type { ReactElement, InputHTMLAttributes } from 'react';
import { Switch } from '../../../mantine';

type ToggleSwitchProps = {
  label?: string;
  helperText?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'>;

export function ToggleSwitch({ label, helperText, id, ...rest }: ToggleSwitchProps): ReactElement {
  return <Switch id={id} label={label} description={helperText} {...rest} />;
}
