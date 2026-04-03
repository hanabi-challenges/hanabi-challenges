import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type StatBlockProps = {
  value: number | string;
  label: ReactNode;
  className?: string;
};

/**
 * StatBlock
 * Compact stat display for use inside cards — a bold number above a muted label.
 */
export function StatBlock({ value, label, className }: StatBlockProps): ReactElement {
  return (
    <Box className={className} style={{ textAlign: 'center' }}>
      <Box
        style={{
          fontWeight: 700,
          fontSize: 'var(--ds-textScale-1-fontSize)',
          lineHeight: 1,
          color: 'var(--ds-color-text)',
        }}
      >
        {value}
      </Box>
      <Box
        style={{
          fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
          color: 'var(--ds-color-text-muted)',
          lineHeight: 1.4,
        }}
      >
        {label}
      </Box>
    </Box>
  );
}
