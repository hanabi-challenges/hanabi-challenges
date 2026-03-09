import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';

type SectionProps = { children: ReactNode; className?: string };

const sectionStyle = {
  padding: 'var(--ds-space-sm) var(--ds-space-md)',
};

export function CardHeader({ children, className }: SectionProps): ReactElement {
  return (
    <Box className={className} style={sectionStyle}>
      {children}
    </Box>
  );
}

export function CardBody({ children, className }: SectionProps): ReactElement {
  return (
    <Box className={className} style={sectionStyle}>
      {children}
    </Box>
  );
}

export function CardFooter({ children, className }: SectionProps): ReactElement {
  return (
    <Box className={className} style={sectionStyle}>
      {children}
    </Box>
  );
}
