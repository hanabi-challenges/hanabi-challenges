import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Table as MantineTable } from '../../../../mantine';

type TableProps = {
  children: ReactNode;
  density?: 'relaxed' | 'tight';
  className?: string;
};

export function Table({ children, density = 'relaxed', className }: TableProps): ReactElement {
  const tight = density === 'tight';
  const cellFontSize: CSSProperties['fontSize'] = tight
    ? 'var(--ds-textScale-3-fontSize, 12px)'
    : undefined;

  return (
    <MantineTable
      highlightOnHover
      withRowBorders
      className={className}
      verticalSpacing={tight ? ('var(--ds-space-xxs)' as never) : ('var(--ds-space-xs)' as never)}
      horizontalSpacing={tight ? ('var(--ds-space-xs)' as never) : ('var(--ds-space-sm)' as never)}
      style={{ '--table-hover-color': 'var(--ds-color-surface-muted)' } as CSSProperties}
      styles={{
        thead: { background: 'var(--ds-color-surface-muted)' } as CSSProperties,
        th: {
          fontWeight: 600,
          fontSize: cellFontSize,
          borderColor: 'var(--ds-color-border)',
        } as CSSProperties,
        td: { fontSize: cellFontSize, borderColor: 'var(--ds-color-border)' } as CSSProperties,
      }}
    >
      {children}
    </MantineTable>
  );
}
