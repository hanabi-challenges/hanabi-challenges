// frontend/src/design-system/components/layout/Page/Page.tsx
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Box } from '../../../mantine';
import { Inline } from '../Inline/Inline';

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

const spacingPaddingMap: Record<PageSpacing, string> = {
  none: '0',
  sm: 'var(--ds-space-xs)',
  md: 'var(--ds-space-sm)',
  lg: 'var(--ds-space-md)',
};

const headerMarginMap: Record<PageSpacing, string> = {
  none: 'var(--ds-space-xs)',
  sm: 'var(--ds-space-xs)',
  md: 'var(--ds-space-sm)',
  lg: 'var(--ds-space-md)',
};

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

  const rootStyle: CSSProperties = {
    display: 'block',
    width: '100%',
    paddingBlock: spacingPaddingMap[spacing],
  };

  const headerStyle: CSSProperties = {
    display: 'flex',
    gap: 'var(--ds-space-xs)',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: headerMarginMap[spacing],
    ...(headerAlign === 'center'
      ? { flexDirection: 'column', alignItems: 'center', textAlign: 'center' }
      : {}),
  };

  return (
    <Box className={className} style={rootStyle} {...rest}>
      {hasHeader ? (
        <Box component="header" style={headerStyle}>
          <Box style={{ minWidth: 0 }}>
            {title ? <Box style={{ marginBottom: 'var(--ds-space-xxs)' }}>{title}</Box> : null}
            {description ? (
              <Box
                style={{
                  color: 'var(--ds-color-text-muted)',
                  fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
                }}
              >
                {description}
              </Box>
            ) : null}
          </Box>

          {actions ? (
            <Box style={{ display: 'block' }}>
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

      <Box>{children}</Box>
    </Box>
  );
}
