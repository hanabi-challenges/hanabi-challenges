import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './PageContainer.css';

type PageContainerProps = {
  children: ReactNode;
  variant?: 'page' | 'panel' | 'narrow';
  className?: string;
};

/**
 * Constrains content width using layout max-width tokens and centers it.
 */
export function PageContainer({
  children,
  variant = 'page',
  className,
}: PageContainerProps): ReactElement {
  const classes = ['ds-page-container', `ds-page-container--${variant}`, className]
    .filter(Boolean)
    .join(' ');
  return <Box className={classes}>{children}</Box>;
}
