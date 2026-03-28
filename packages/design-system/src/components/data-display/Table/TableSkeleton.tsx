import type { CSSProperties, ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';

type TableSkeletonProps = {
  rows?: number;
  cols?: number;
  density?: 'relaxed' | 'tight';
  animate?: boolean;
  className?: string;
};

/**
 * TableSkeleton
 * Renders a table-shaped shimmer placeholder with a header row and data rows.
 */
export function TableSkeleton({
  rows = 5,
  cols = 4,
  density = 'relaxed',
  animate = true,
  className,
}: TableSkeletonProps): ReactElement {
  const tight = density === 'tight';
  const cellPaddingV = tight ? 'var(--ds-space-xxs)' : 'var(--ds-space-xs)';
  const cellPaddingH = tight ? 'var(--ds-space-xs)' : 'var(--ds-space-sm)';
  const cellHeight = tight ? '12px' : '14px';

  const cellStyle: CSSProperties = {
    padding: `${cellPaddingV} ${cellPaddingH}`,
    borderBottom: '1px solid var(--ds-color-border)',
  };

  const headerCellStyle: CSSProperties = {
    ...cellStyle,
    background: 'var(--ds-color-surface-muted)',
  };

  return (
    <div
      className={className}
      style={{
        borderRadius: 'var(--ds-radius-sm)',
        border: '1px solid var(--ds-color-border)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {Array.from({ length: cols }, (_, i) => (
              <th key={i} style={headerCellStyle}>
                <Skeleton
                  width={`${55 + ((i * 23) % 30)}%`}
                  height={cellHeight}
                  animate={animate}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} style={cellStyle}>
                  <Skeleton
                    width={`${45 + (((r + c) * 17) % 40)}%`}
                    height={cellHeight}
                    animate={animate}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
