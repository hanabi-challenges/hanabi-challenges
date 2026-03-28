import type { ReactElement } from 'react';
import { Box, TextInput } from '../../../mantine';

type DatePickerProps = {
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * DatePicker
 * Date selection component (single date) using a native date input.
 */
export function DatePicker({
  value,
  onChange,
  label,
  placeholder,
  disabled,
  className,
}: DatePickerProps): ReactElement {
  return (
    <Box style={{ width: '100%' }} className={className}>
      <TextInput
        type="date"
        label={label}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange?.(e.currentTarget.value)}
      />
    </Box>
  );
}
