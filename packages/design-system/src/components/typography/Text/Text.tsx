import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Text as MantineText } from '../../../mantine';

export type TextVariant = 'body' | 'muted' | 'subtle' | 'label' | 'caption' | 'overline';
export type TextWeight = 'normal' | 'semibold' | 'bold';

type TextProps = {
  children: ReactNode;
  variant?: TextVariant;
  weight?: TextWeight;
  truncate?: boolean;
  lineClamp?: number;
  preWrap?: boolean;
  className?: string;
};

const variantStyles: Record<TextVariant, CSSProperties> = {
  body: {
    color: 'var(--ds-color-text)',
  },
  muted: {
    color: 'var(--ds-color-text-muted)',
  },
  subtle: {
    color: 'var(--ds-color-text-muted)',
  },
  label: {
    fontWeight: 600,
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
    color: 'var(--ds-color-text)',
  },
  caption: {
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
    color: 'var(--ds-color-text-muted)',
  },
  overline: {
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--ds-color-text-muted)',
  },
};

const weightMap: Record<TextWeight, CSSProperties['fontWeight']> = {
  normal: 400,
  semibold: 600,
  bold: 700,
};

/**
 * Text variants for inline copy/meta text.
 */
export function Text({
  children,
  variant = 'body',
  weight,
  truncate,
  lineClamp,
  preWrap,
  className,
}: TextProps): ReactElement {
  const extra: CSSProperties = {};

  if (weight) extra.fontWeight = weightMap[weight];

  if (truncate) {
    extra.overflow = 'hidden';
    extra.textOverflow = 'ellipsis';
    extra.whiteSpace = 'nowrap';
  }

  if (lineClamp != null) {
    Object.assign(extra, {
      overflow: 'hidden',
      display: '-webkit-box',
      WebkitLineClamp: lineClamp,
      WebkitBoxOrient: 'vertical',
    } as CSSProperties);
  }

  if (preWrap) {
    extra.whiteSpace = 'pre-wrap';
  }

  return (
    <MantineText
      component="span"
      className={className}
      style={{ ...variantStyles[variant], ...extra }}
    >
      {children}
    </MantineText>
  );
}
