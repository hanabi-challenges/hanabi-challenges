import type { ReactElement } from 'react';
import { NumberInput as MantineNumberInput } from '../../../mantine';

/**
 * NumberInput
 * Numeric input with stepper controls and proper min/max/step handling.
 * Delegates to Mantine's NumberInput.
 */
export function NumberInput(
  props: React.ComponentPropsWithoutRef<typeof MantineNumberInput>,
): ReactElement {
  return <MantineNumberInput {...props} />;
}
