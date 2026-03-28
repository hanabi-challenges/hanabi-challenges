import type { CSSProperties, ReactElement } from 'react';
import { Badge as MantineBadge } from '../../../mantine';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type BadgeSize = 'sm' | 'md';

type BadgeProps = {
  tone?: BadgeTone;
  size?: BadgeSize;
  children: ReactElement | string;
  className?: string;
};

type ToneTokens = { bg: string; text: string };

const toneTokens: Record<BadgeTone, ToneTokens> = {
  neutral: {
    bg: 'var(--ds-color-tone-neutral-bg)',
    text: 'var(--ds-color-tone-neutral-text)',
  },
  info: {
    bg: 'var(--ds-color-tone-info-bg)',
    text: 'var(--ds-color-tone-info-text)',
  },
  success: {
    bg: 'var(--ds-color-tone-success-bg)',
    text: 'var(--ds-color-tone-success-text)',
  },
  warning: {
    bg: 'var(--ds-color-tone-warning-bg)',
    text: 'var(--ds-color-tone-warning-text)',
  },
  danger: {
    bg: 'var(--ds-color-tone-danger-bg)',
    text: 'var(--ds-color-tone-danger-text)',
  },
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  children,
  className,
}: BadgeProps): ReactElement {
  const { bg, text } = toneTokens[tone];
  return (
    <MantineBadge
      size={size}
      className={className}
      styles={{
        root: { background: bg, color: text, borderColor: text } as CSSProperties,
        label: { color: text } as CSSProperties,
      }}
    >
      {children}
    </MantineBadge>
  );
}
