import type { ReactElement } from 'react';
import { Skeleton } from '../../feedback/Skeleton/Skeleton';
import { Card } from './Card';
import type { CardVariant, CardPadding } from './Card';

type CardSkeletonProps = {
  /** Number of body text lines. */
  lines?: number;
  variant?: CardVariant;
  padding?: CardPadding;
  /** Show a heading-sized skeleton at the top. */
  showHeader?: boolean;
  /** Show a footer row (e.g. action buttons). */
  showFooter?: boolean;
  animate?: boolean;
  className?: string;
};

/**
 * CardSkeleton
 * Renders a Card shell filled with shimmer lines — useful for list/grid
 * loading states where card count is known but content is not yet fetched.
 */
export function CardSkeleton({
  lines = 3,
  variant = 'elevated',
  padding = 'md',
  showHeader = true,
  showFooter = false,
  animate = true,
  className,
}: CardSkeletonProps): ReactElement {
  return (
    <Card variant={variant} padding={padding} className={className}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-sm)' }}>
        {showHeader && <Skeleton width="55%" height="22px" animate={animate} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-xs)' }}>
          {Array.from({ length: lines }, (_, i) => (
            <Skeleton
              key={i}
              width={i === lines - 1 ? '60%' : '90%'}
              height="14px"
              animate={animate}
            />
          ))}
        </div>
        {showFooter && (
          <div
            style={{ display: 'flex', gap: 'var(--ds-space-xs)', marginTop: 'var(--ds-space-xs)' }}
          >
            <Skeleton width={80} height="32px" radius="var(--ds-radius-md)" animate={animate} />
            <Skeleton width={64} height="32px" radius="var(--ds-radius-md)" animate={animate} />
          </div>
        )}
      </div>
    </Card>
  );
}
