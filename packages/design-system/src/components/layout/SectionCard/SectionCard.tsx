import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Card } from '../Card/Card';

export type SectionCardDensity = 'comfortable' | 'compact';

export type SectionCardProps = {
  children: ReactNode;
  density?: SectionCardDensity;
  className?: string;
  style?: CSSProperties;
};

/**
 * SectionCard
 * Standardized outline card for form/section blocks.
 */
export function SectionCard({
  children,
  density = 'comfortable',
  className,
  style,
}: SectionCardProps): ReactElement {
  return (
    <Card
      variant="outline"
      padding={density === 'compact' ? 'sm' : 'md'}
      className={className}
      style={style}
    >
      {children}
    </Card>
  );
}
