import type { CSSProperties, ReactElement } from 'react';
import { Skeleton as MantineSkeleton } from '../../../mantine';

export type SkeletonProps = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  /** Defaults to pill (999px) for inline elements, or ds-radius-sm for blocks. */
  radius?: string | number;
  animate?: boolean;
  circle?: boolean;
  className?: string;
};

/**
 * Skeleton
 * Base shimmer placeholder for loading states. All *Skeleton companion
 * components are built on top of this primitive.
 */
export function Skeleton({
  width,
  height = '1em',
  radius = 'var(--ds-radius-sm)',
  animate = true,
  circle = false,
  className,
}: SkeletonProps): ReactElement {
  return (
    <MantineSkeleton
      width={width as string}
      height={height as string}
      radius={radius as string}
      animate={animate}
      circle={circle}
      className={className}
    />
  );
}
