import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import type { PillSize } from './Pill';

type PillSkeletonProps = {
  size?: PillSize;
  width?: string | number;
  animate?: boolean;
  className?: string;
};

const heightBySize: Record<PillSize, string> = {
  xs: '20px',
  sm: '24px',
  md: '32px',
  lg: '36px',
};

/**
 * PillSkeleton
 * Pill-shaped shimmer placeholder matching Pill dimensions.
 */
export function PillSkeleton({
  size = 'md',
  width = 80,
  animate = true,
  className,
}: PillSkeletonProps): ReactElement {
  return (
    <Skeleton
      width={width}
      height={heightBySize[size]}
      radius="var(--ds-radius-pill)"
      animate={animate}
      className={className}
    />
  );
}
