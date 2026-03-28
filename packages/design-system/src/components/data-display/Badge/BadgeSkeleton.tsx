import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import type { BadgeSize } from './Badge';

type BadgeSkeletonProps = {
  size?: BadgeSize;
  width?: string | number;
  animate?: boolean;
  className?: string;
};

const heightBySize: Record<BadgeSize, string> = {
  sm: '18px',
  md: '22px',
};

/**
 * BadgeSkeleton
 * Pill-shaped shimmer placeholder matching Badge dimensions.
 */
export function BadgeSkeleton({
  size = 'md',
  width = 64,
  animate = true,
  className,
}: BadgeSkeletonProps): ReactElement {
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
