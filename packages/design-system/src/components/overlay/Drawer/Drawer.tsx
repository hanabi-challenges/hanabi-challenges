import type { ReactElement, ReactNode } from 'react';
import { Drawer as MantineDrawer } from '../../../mantine';

export type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: ReactNode;
  position?: 'left' | 'right' | 'top' | 'bottom';
  size?: string | number;
};

/**
 * Drawer
 * Slide-in panel for side content; supports overlay and close controls.
 */
export function Drawer({
  open,
  onClose,
  children,
  title,
  position = 'right',
  size = '400px',
}: DrawerProps): ReactElement {
  return (
    <MantineDrawer opened={open} onClose={onClose} title={title} position={position} size={size}>
      {children}
    </MantineDrawer>
  );
}
