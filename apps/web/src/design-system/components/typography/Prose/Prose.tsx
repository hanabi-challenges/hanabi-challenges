import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Prose.css';
import { textStyles } from '../../../primitives/text-styles';

/**
 * Prose
 * Styled container for long-form text/Markdown using serif body font.
 */
export function Prose({ children }: { children: ReactNode }): ReactElement {
  const prose = textStyles.prose.md;
  const style = {
    // Bridge token values into CSS custom props for the stylesheet to consume
    ['--ds-prose-font-family' as string]: prose.fontFamily,
    ['--ds-prose-font-size' as string]: prose.fontSize,
    ['--ds-prose-line-height' as string]: prose.lineHeight.toString(),
  };
  return (
    <Box className="ds-prose" style={style}>
      {wrapInline(children)}
    </Box>
  );
}

function wrapInline(node: ReactNode): ReactNode {
  // If it's already an array of elements, map recursively
  if (Array.isArray(node)) {
    return node.map((child, idx) => <React.Fragment key={idx}>{wrapInline(child)}</React.Fragment>);
  }

  // Leave valid React elements alone (they control their own semantics)
  if (isReactElement(node)) {
    return node;
  }

  // If it's a string/number/boolean/null/undefined, wrap in a paragraph for spacing
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    return <Box component="p">{node}</Box>;
  }

  // For anything else (null/undefined), just return as-is
  return node;
}

function isReactElement(node: ReactNode): node is React.ReactElement {
  return typeof node === 'object' && node !== null && 'props' in node;
}
