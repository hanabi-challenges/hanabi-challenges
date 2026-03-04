// frontend/src/design-system/components/layout/Page/Page.tsx
import type { HTMLAttributes, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import { Inline } from '../Inline/Inline';
import './Page.css';

export type PageSpacing = 'none' | 'sm' | 'md' | 'lg';
export type PageHeaderAlign = 'start' | 'center';

export type PageProps = {
  /**
   * Primary page heading area.
   * Usually a Typography/Heading component.
   */
  title?: ReactNode;

  /**
   * Optional description or supporting text under the title.
   */
  description?: ReactNode;

  /**
   * Optional actions aligned with the header (e.g. buttons/links).
   */
  actions?: ReactNode;

  /**
   * Main page content.
   */
  children: ReactNode;

  /**
   * Controls vertical spacing between header and body,
   * and overall page padding. Hooks into CSS spacing tokens.
   */
  spacing?: PageSpacing;

  /**
   * Alignment of the header block (title + description + actions).
   */
  headerAlign?: PageHeaderAlign;

  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>;

export function Page({
  title,
  description,
  actions,
  children,
  spacing = 'md',
  headerAlign = 'start',
  className,
  ...rest
}: PageProps) {
  const hasHeader = title || description || actions;

  const rootClassName = [
    'ui-page',
    `ui-page--spacing-${spacing}`,
    `ui-page--header-align-${headerAlign}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Box className={rootClassName} {...rest}>
      {hasHeader ? (
        <Box component="header" className="ui-page__header">
          <Box className="ui-page__header-main">
            {title ? <Box className="ui-page__title">{title}</Box> : null}
            {description ? <Box className="ui-page__description">{description}</Box> : null}
          </Box>

          {actions ? (
            <Box className="ui-page__header-actions">
              <Inline
                gap="sm"
                align="center"
                justify={headerAlign === 'center' ? 'center' : 'end'}
                wrap
              >
                {actions}
              </Inline>
            </Box>
          ) : null}
        </Box>
      ) : null}

      <Box className="ui-page__body">{children}</Box>
    </Box>
  );
}
