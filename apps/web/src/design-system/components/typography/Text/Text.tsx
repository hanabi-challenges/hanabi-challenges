import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Text.css';

export type TextVariant = 'body' | 'muted' | 'subtle' | 'label' | 'caption' | 'overline';

type TextProps = {
  children: ReactNode;
  variant?: TextVariant;
  className?: string;
};

/**
 * Text variants for inline copy/meta text.
 */
export function Text({ children, variant = 'body', className }: TextProps): ReactElement {
  const classes = ['ds-text', `ds-text--${variant}`, className].filter(Boolean).join(' ');
  return (
    <Box className={classes} component="span">
      {children}
    </Box>
  );
}
