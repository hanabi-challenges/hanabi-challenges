import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';

type KPITextSkeletonProps = {
  size?: 'sm' | 'md' | 'lg';
  /** Show a label line above the value. */
  showLabel?: boolean;
  /** Show a subtext line below the value. */
  showSubtext?: boolean;
  animate?: boolean;
  className?: string;
};

const valueHeightBySize: Record<'sm' | 'md' | 'lg', string> = {
  sm: '24px',
  md: '34px',
  lg: '48px',
};

/**
 * KPITextSkeleton
 * Shimmer placeholder matching KPIText's label / value / subtext layout.
 */
export function KPITextSkeleton({
  size = 'md',
  showLabel = true,
  showSubtext = false,
  animate = true,
  className,
}: KPITextSkeletonProps): ReactElement {
  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xxs)' }}
    >
      {showLabel && <Skeleton width={80} height="12px" animate={animate} />}
      <Skeleton width={60} height={valueHeightBySize[size]} animate={animate} />
      {showSubtext && <Skeleton width={100} height="12px" animate={animate} />}
    </div>
  );
}
