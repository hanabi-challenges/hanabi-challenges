import type { ReactElement, ReactNode } from 'react';
import { Anchor, Box, Breadcrumbs as MantineBreadcrumbs } from '../../../mantine';

type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  className?: string;
};

/**
 * Breadcrumbs
 * Hierarchical navigation trail with separators.
 */
export function Breadcrumbs({ items, separator, className }: BreadcrumbsProps): ReactElement {
  return (
    <MantineBreadcrumbs separator={separator} className={className}>
      {items.map((item, idx) =>
        item.href ? (
          <Anchor
            key={idx}
            href={item.href}
            style={{ fontSize: 'var(--ds-textScale-3-fontSize, 12px)' }}
          >
            {item.label}
          </Anchor>
        ) : (
          <Box
            key={idx}
            component="span"
            style={{
              fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
              color: 'var(--ds-color-text-muted)',
            }}
          >
            {item.label}
          </Box>
        ),
      )}
    </MantineBreadcrumbs>
  );
}
