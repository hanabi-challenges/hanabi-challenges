import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import type { TextVariant } from './Text';

type TextSkeletonProps = {
  /** Number of lines to render. */
  lines?: number;
  /**
   * Width of each line. A single value applies to all lines; an array
   * sets per-line widths (last line conventionally shorter).
   */
  width?: string | number | (string | number)[];
  variant?: TextVariant;
  animate?: boolean;
  className?: string;
};

const heightByVariant: Record<TextVariant, string> = {
  body: '14px',
  muted: '14px',
  subtle: '14px',
  label: '12px',
  caption: '12px',
  overline: '12px',
};

/**
 * TextSkeleton
 * Shimmer placeholder that mirrors the height of Text variants.
 */
export function TextSkeleton({
  lines = 1,
  width,
  variant = 'body',
  animate = true,
  className,
}: TextSkeletonProps): ReactElement {
  const height = heightByVariant[variant];

  if (lines === 1) {
    const w = Array.isArray(width) ? (width[0] ?? '75%') : (width ?? '75%');
    return <Skeleton width={w} height={height} animate={animate} className={className} />;
  }

  const widths = Array.isArray(width)
    ? width
    : Array.from({ length: lines }, (_, i) => (i === lines - 1 ? '50%' : (width ?? '90%')));

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)' }}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={widths[i] ?? '90%'} height={height} animate={animate} />
      ))}
    </div>
  );
}
