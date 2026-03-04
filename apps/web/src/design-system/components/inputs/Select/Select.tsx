import type { ReactElement } from 'react';
import { Select as MantineSelect } from '../../../../mantine';
import './Select.css';

export type SelectOption = { value: string; label: string };

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

export function Select({
  options,
  value,
  onChange,
  disabled,
  className,
  placeholder,
}: SelectProps): ReactElement {
  return (
    <MantineSelect
      className={['ds-select', className].filter(Boolean).join(' ')}
      classNames={{
        wrapper: 'ds-select__wrapper',
        input: 'ds-select__input',
        dropdown: 'ds-select__dropdown',
        option: 'ds-select__option',
      }}
      value={value}
      disabled={disabled}
      onChange={(next) => onChange(next ?? '')}
      data={options.map((opt) => ({ value: opt.value, label: opt.label }))}
      placeholder={placeholder}
      clearable={Boolean(placeholder)}
    />
  );
}
