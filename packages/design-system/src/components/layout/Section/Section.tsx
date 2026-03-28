import {
  createContext,
  useContext,
  type CSSProperties,
  type ElementType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Box } from '../../../mantine';

type SectionHeaderRenderer = (level: number) => ReactNode;

type SectionProps = {
  children?: ReactNode;
  paddingY?: 'sm' | 'md' | 'lg';
  paddingX?: 'none' | 'sm' | 'md';
  className?: string;
  as?: ElementType;
  header?: ReactNode | SectionHeaderRenderer;
  subheader?: ReactNode;
  style?: CSSProperties;
  /**
   * Base heading level for this section tree. Defaults to 3 (h3).
   * Nested sections automatically increment from this base.
   */
  baseLevel?: number;
};

const SectionDepthContext = createContext<{ depth: number; baseLevel: number }>({
  depth: 0,
  baseLevel: 3,
});

function gapForDepth(depth: number): string {
  if (depth <= 0) return 'var(--ds-space-md)';
  if (depth === 1) return 'var(--ds-space-sm)';
  return 'var(--ds-space-xs)';
}

const paddingYMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'var(--ds-space-sm)',
  md: 'var(--ds-space-md)',
  lg: 'var(--ds-space-lg)',
};

const paddingXMap: Record<'none' | 'sm' | 'md', string> = {
  none: '0',
  sm: 'var(--ds-space-sm)',
  md: 'var(--ds-space-md)',
};

export function Section({
  children,
  paddingY = 'md',
  paddingX = 'none',
  className,
  as,
  header,
  subheader,
  style,
  baseLevel,
}: SectionProps): ReactElement {
  const ctx = useContext(SectionDepthContext);
  const depth = ctx.depth;
  const effectiveBase = baseLevel ?? ctx.baseLevel ?? 3;
  const headingLevel = Math.max(1, Math.min(6, effectiveBase + depth));
  const nextDepth = depth + 1;
  const Component = (as || 'section') as ElementType;

  const gap = gapForDepth(depth);
  const childGap = 'var(--ds-space-sm)';
  const headerGap = header
    ? depth === 0
      ? 'var(--ds-space-lg)'
      : 'var(--ds-space-md)'
    : undefined;
  const subheaderGap =
    subheader && headerGap
      ? `calc(${headerGap} / 2)`
      : subheader
        ? depth === 0
          ? 'var(--ds-space-md)'
          : 'var(--ds-space-sm)'
        : undefined;

  const sectionStyle: CSSProperties = {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: childGap,
    paddingTop: paddingYMap[paddingY],
    paddingBottom: paddingYMap[paddingY],
    paddingLeft: paddingXMap[paddingX],
    paddingRight: paddingXMap[paddingX],
    // expose gap vars for nested sections' margin-top calculation
    ['--ds-section-gap' as string]: gap,
    ['--ds-section-child-gap' as string]: childGap,
    ...style,
  };

  const renderHeader =
    typeof header === 'function' ? (header as SectionHeaderRenderer)(headingLevel) : header;

  return (
    <SectionDepthContext.Provider value={{ depth: nextDepth, baseLevel: effectiveBase }}>
      <Box component={Component} className={className} style={sectionStyle} data-depth={depth}>
        {renderHeader ? (
          <Box style={{ marginBottom: headerGap ?? 'var(--ds-space-sm)' }}>{renderHeader}</Box>
        ) : null}
        {subheader ? (
          <Box style={{ marginBottom: subheaderGap ?? 'var(--ds-space-sm)' }}>{subheader}</Box>
        ) : null}
        <Box>{children}</Box>
      </Box>
    </SectionDepthContext.Provider>
  );
}
