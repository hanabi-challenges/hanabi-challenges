import type { ReactElement, ReactNode } from 'react';
import { Box, Text, Title } from '../../../mantine';

type KPITextTone = 'positive' | 'neutral' | 'negative' | 'default';

type KPITextProps = {
  value: ReactNode;
  label?: ReactNode;
  subtext?: ReactNode;
  tone?: KPITextTone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const toneColorMap: Record<KPITextTone, string> = {
  positive: 'var(--ds-color-semantic-kpiText-positive-onLightSurface)',
  neutral: 'var(--ds-color-semantic-kpiText-neutral-onLightSurface)',
  negative: 'var(--ds-color-semantic-kpiText-negative-onLightSurface)',
  default: 'var(--ds-color-text)',
};

const sizeMap: Record<'sm' | 'md' | 'lg', { order: 1 | 2 | 3 | 4 | 5 | 6; fontSize: string }> = {
  sm: { order: 3, fontSize: 'var(--ds-textScale-7-fontSize, 20px)' },
  md: { order: 2, fontSize: 'var(--ds-textScale-9-fontSize, 28px)' },
  lg: { order: 1, fontSize: 'var(--ds-textScale-11-fontSize, 40px)' },
};

/**
 * KPIText
 * Big-number display for stats, with optional label/subtext.
 */
export function KPIText({
  value,
  label,
  subtext,
  tone = 'default',
  size = 'md',
  className,
}: KPITextProps): ReactElement {
  const color = toneColorMap[tone];
  const { order, fontSize } = sizeMap[size];

  return (
    <Box
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xxs)' }}
    >
      {label ? (
        <Text
          component="span"
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-text-muted)',
          }}
        >
          {label}
        </Text>
      ) : null}
      <Title order={order} style={{ color, fontSize, fontWeight: 700, lineHeight: 1.2, margin: 0 }}>
        {value}
      </Title>
      {subtext ? (
        <Text
          component="span"
          style={{
            fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
            color: 'var(--ds-color-text-muted)',
          }}
        >
          {subtext}
        </Text>
      ) : null}
    </Box>
  );
}
