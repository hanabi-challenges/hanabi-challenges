import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

export type TimelineDotVariant = 'default' | 'transition';

type TimelineDotProps = {
  children: ReactNode;
  variant?: TimelineDotVariant;
  className?: string;
};

const variantStyles = {
  default: {
    background: 'var(--ds-color-surface-muted)',
    border: '1px solid var(--ds-color-border)',
    color: 'var(--ds-color-text-muted)',
  },
  transition: {
    background: 'var(--ds-color-tone-info-bg)',
    border: '1px solid transparent',
    color: 'var(--ds-color-tone-info-text)',
  },
};

/**
 * TimelineDot
 * Circular indicator used as the left-rail marker in a timeline layout.
 * Use variant="transition" for system events, variant="default" for user actions.
 */
export function TimelineDot({
  children,
  variant = 'default',
  className,
}: TimelineDotProps): ReactElement {
  return (
    <Box
      className={className}
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        fontWeight: 700,
        fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
        ...variantStyles[variant],
      }}
    >
      {children}
    </Box>
  );
}
