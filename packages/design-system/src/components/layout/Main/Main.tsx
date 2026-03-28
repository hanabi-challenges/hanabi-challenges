import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type MainProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Main({ children, className, style }: MainProps): ReactElement {
  return (
    <Box component="main" className={className} style={style}>
      {children}
    </Box>
  );
}
