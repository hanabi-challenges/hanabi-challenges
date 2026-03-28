import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import type { HeadingLevel } from './Heading';

type HeadingSkeletonProps = {
  level?: HeadingLevel;
  width?: string | number;
  animate?: boolean;
  className?: string;
};

/** Approximate rendered height per heading level, matching textStyles tokens. */
const heightByLevel: Record<HeadingLevel, string> = {
  1: '40px',
  2: '32px',
  3: '26px',
  4: '22px',
  5: '20px',
  6: '18px',
};

/**
 * HeadingSkeleton
 * Shimmer placeholder sized to match a Heading at the given level.
 */
export function HeadingSkeleton({
  level = 2,
  width = '55%',
  animate = true,
  className,
}: HeadingSkeletonProps): ReactElement {
  return (
    <Skeleton width={width} height={heightByLevel[level]} animate={animate} className={className} />
  );
}
