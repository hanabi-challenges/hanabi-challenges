import type { ReactElement, ReactNode } from 'react';
import { Table as MantineTable } from '../../../../mantine';
import './Table.css';

type TableProps = {
  children: ReactNode;
  density?: 'relaxed' | 'tight';
  className?: string;
};

export function Table({ children, density = 'relaxed', className }: TableProps): ReactElement {
  const densityClass = density === 'tight' ? 'ds-table--tight' : 'ds-table--relaxed';
  return (
    <MantineTable className={['ds-table', densityClass, className].filter(Boolean).join(' ')}>
      {children}
    </MantineTable>
  );
}
