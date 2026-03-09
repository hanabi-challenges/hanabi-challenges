import type { ReactElement } from 'react';
import { Badge as MantineBadge } from '../../../../mantine';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  tone?: BadgeTone;
  size?: BadgeSize;
  children: ReactElement | string;
  className?: string;
};

const colorMap: Record<BadgeTone, string> = {
  neutral: 'gray',
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  danger: 'red',
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
}: BadgeProps): ReactElement {
  return (
    <MantineBadge color={colorMap[tone]} size={size} className={className}>
      {children}
    </MantineBadge>
  );
}
