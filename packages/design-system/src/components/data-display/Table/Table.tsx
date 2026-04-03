import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Table as MantineTable } from '../../../mantine';

type TableProps = {
  children: ReactNode;
  density?: 'relaxed' | 'tight';
  className?: string;
  style?: CSSProperties;
};

function TableComponent({
  children,
  density = 'relaxed',
  className,
  style,
}: TableProps): ReactElement {
  const tight = density === 'tight';
  const cellFontSize: CSSProperties['fontSize'] = tight
    ? 'var(--ds-textScale-3-fontSize, 12px)'
    : undefined;

  return (
    <MantineTable
      highlightOnHover
      withRowBorders
      className={className}
      style={{ '--table-hover-color': 'var(--ds-color-surface-muted)', ...style } as CSSProperties}
      verticalSpacing={tight ? ('var(--ds-space-xxs)' as never) : ('var(--ds-space-xs)' as never)}
      horizontalSpacing={tight ? ('var(--ds-space-xs)' as never) : ('var(--ds-space-sm)' as never)}
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

export const Table = Object.assign(TableComponent, {
  Thead: MantineTable.Thead,
  Tbody: MantineTable.Tbody,
  Tfoot: MantineTable.Tfoot,
  Tr: MantineTable.Tr,
  Th: MantineTable.Th,
  Td: MantineTable.Td,
  Caption: MantineTable.Caption,
});
