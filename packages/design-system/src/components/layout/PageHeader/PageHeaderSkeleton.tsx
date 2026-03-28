import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import { Inline } from '../Inline/Inline';

type PageHeaderSkeletonProps = {
  level?: 1 | 2 | 3 | 4;
  /** Show a subtitle line below the title. */
  showSubtitle?: boolean;
  /** Show an action placeholder on the right. */
  showActions?: boolean;
  actionsWidth?: number;
  animate?: boolean;
  className?: string;
};

const titleHeightByLevel: Record<1 | 2 | 3 | 4, string> = {
  1: '40px',
  2: '32px',
  3: '26px',
  4: '22px',
};

/**
 * PageHeaderSkeleton
 * Shimmer placeholder matching PageHeader's title / subtitle / actions layout.
 */
export function PageHeaderSkeleton({
  level = 1,
  showSubtitle = true,
  showActions = false,
  actionsWidth = 120,
  animate = true,
  className,
}: PageHeaderSkeletonProps): ReactElement {
  return (
    <Inline
      justify="space-between"
      align="start"
      wrap
      style={{ width: '100%' }}
      className={className}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)' }}>
        <Skeleton width="45%" height={titleHeightByLevel[level]} animate={animate} />
        {showSubtitle && <Skeleton width="65%" height="14px" animate={animate} />}
      </div>
      {showActions && (
        <Skeleton
          width={actionsWidth}
          height="32px"
          radius="var(--ds-radius-md)"
          animate={animate}
        />
      )}
    </Inline>
  );
}
