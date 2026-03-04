import type { ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './CardSections.css';

type SectionProps = { children: ReactNode; className?: string };

export function CardHeader({ children, className }: SectionProps): ReactElement {
  return <Box className={['ds-card__header', className].filter(Boolean).join(' ')}>{children}</Box>;
}

export function CardBody({ children, className }: SectionProps): ReactElement {
  return <Box className={['ds-card__body', className].filter(Boolean).join(' ')}>{children}</Box>;
}

export function CardFooter({ children, className }: SectionProps): ReactElement {
  return <Box className={['ds-card__footer', className].filter(Boolean).join(' ')}>{children}</Box>;
}
