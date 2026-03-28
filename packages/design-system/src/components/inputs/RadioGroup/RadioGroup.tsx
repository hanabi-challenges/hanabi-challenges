import type { ReactElement } from 'react';
import { Radio } from '../../../mantine';
import { Stack } from '../../layout/Stack/Stack';

type RadioGroupOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type RadioGroupProps = {
  value: string;
  onChange: (value: string) => void;
  options: RadioGroupOption[];
  label?: string;
  name?: string;
  className?: string;
};

/**
 * RadioGroup
 * Manages a set of Radio buttons with shared name/value, keyboard navigation, and spacing.
 */
export function RadioGroup({
  value,
  onChange,
  options,
  label,
  name,
  className,
}: RadioGroupProps): ReactElement {
  return (
    <Radio.Group value={value} onChange={onChange} label={label} className={className} name={name}>
      <Stack gap="xs" style={{ marginTop: 'var(--ds-space-xxs)' }}>
        {options.map((opt) => (
          <Radio key={opt.value} value={opt.value} label={opt.label} disabled={opt.disabled} />
        ))}
      </Stack>
    </Radio.Group>
  );
}
