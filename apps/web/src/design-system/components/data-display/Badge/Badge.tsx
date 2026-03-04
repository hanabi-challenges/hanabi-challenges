import type { ReactElement } from 'react';
import { Box } from '../../../../mantine';
import './Badge.css';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  tone?: BadgeTone;
  size?: BadgeSize;
  children: ReactElement | string;
  className?: string;
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
}: BadgeProps): ReactElement {
  const rootClass = ['ds-badge', `ds-badge--${tone}`, `ds-badge--${size}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <Box className={rootClass} component="span">
      {children}
    </Box>
  );
}
