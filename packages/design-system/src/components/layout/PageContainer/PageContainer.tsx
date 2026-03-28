import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type PageContainerProps = {
  children: ReactNode;
  variant?: 'page' | 'panel' | 'narrow';
  className?: string;
};

const maxWidthMap: Record<'page' | 'panel' | 'narrow', string> = {
  page: 'var(--ds-layout-maxWidth-page, 1100px)',
  panel: 'var(--ds-layout-maxWidth-panel, 720px)',
  narrow: 'var(--ds-layout-maxWidth-narrow, 640px)',
};

/**
 * Constrains content width using layout max-width tokens and centers it.
 */
export function PageContainer({
  children,
  variant = 'page',
  className,
}: PageContainerProps): ReactElement {
  const style: CSSProperties = {
    width: '100%',
    margin: '0 auto',
    padding: '0 var(--ds-layout-pagePadding, 16px)',
    maxWidth: maxWidthMap[variant],
  };

  return (
    <Box className={className} style={style}>
      {children}
    </Box>
  );
}
