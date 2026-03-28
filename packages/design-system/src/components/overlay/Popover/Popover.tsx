import type { ReactElement, ReactNode } from 'react';
import { Popover as MantinePopover } from '../../../mantine';

export type PopoverProps = {
  trigger: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: number | string;
};

/**
 * Popover
 * Contextual overlay for actions/tooltips; positions relative to trigger.
 */
export function Popover({
  trigger,
  children,
  position = 'bottom',
  width = 200,
}: PopoverProps): ReactElement {
  return (
    <MantinePopover position={position} width={width} withArrow>
      <MantinePopover.Target>{trigger}</MantinePopover.Target>
      <MantinePopover.Dropdown>{children}</MantinePopover.Dropdown>
    </MantinePopover>
  );
}
