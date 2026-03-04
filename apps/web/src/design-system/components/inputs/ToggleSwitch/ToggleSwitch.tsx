import type { ReactElement, InputHTMLAttributes } from 'react';
import { Switch } from '../../../../mantine';
import './ToggleSwitch.css';

type ToggleSwitchProps = {
  label?: string;
  helperText?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export function ToggleSwitch({ label, helperText, id, ...rest }: ToggleSwitchProps): ReactElement {
  return <Switch id={id} className="ds-toggle" label={label} description={helperText} {...rest} />;
}
