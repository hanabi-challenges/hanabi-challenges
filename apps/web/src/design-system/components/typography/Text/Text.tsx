import type { CSSProperties, ReactNode } from 'react';
import { Text as MantineText } from '../../../../mantine';

export type TextVariant = 'body' | 'muted' | 'subtle' | 'label' | 'caption' | 'overline';

type TextProps = {
  children: ReactNode;
  variant?: TextVariant;
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

/**
 * Text variants for inline copy/meta text.
 */
export function Text({ children, variant = 'body', className }: TextProps) {
  return (
    <MantineText component="span" className={className} style={variantStyles[variant]}>
      {children}
    </MantineText>
  );
}
