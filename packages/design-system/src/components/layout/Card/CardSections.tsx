import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Box } from '../../../mantine';

type SectionProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
};

const sectionStyle = {
  padding: 'var(--ds-space-sm) var(--ds-space-md)',
};

export function CardHeader({ children, className, style, onClick }: SectionProps): ReactElement {
  return (
    <Box className={className} style={{ ...sectionStyle, ...style }} onClick={onClick}>
      {children}
    </Box>
  );
}

export function CardBody({ children, className, style, onClick }: SectionProps): ReactElement {
  return (
    <Box className={className} style={{ ...sectionStyle, ...style }} onClick={onClick}>
      {children}
    </Box>
  );
}

export function CardFooter({ children, className, style, onClick }: SectionProps): ReactElement {
  return (
    <Box className={className} style={{ ...sectionStyle, ...style }} onClick={onClick}>
      {children}
    </Box>
  );
}
