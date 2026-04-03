import type { MouseEventHandler, ReactNode } from 'react';

/**
 * Mantine v8 does not include `children` or common HTML event handlers in
 * BoxProps, which React 19's stricter JSX typing requires explicitly. Augment
 * here so all Mantine container components (Box, Paper, and anything that
 * extends BoxProps) accept these props without type errors.
 */
declare module '@mantine/core' {
  interface BoxProps {
    children?: ReactNode;
    onClick?: MouseEventHandler<HTMLElement>;
  }
}
