import type { ComponentPropsWithoutRef, ElementType, ReactElement, ReactNode } from 'react';
import { Box } from '../../../../mantine';
import './Pill.css';

export type PillSize = 'sm' | 'md' | 'lg';
export type PillVariant = 'default' | 'accent';

export type PillProps<T extends ElementType = 'div'> = {
  as?: T;
  children: ReactNode;
  size?: PillSize;
  variant?: PillVariant;
  className?: string;
  interactive?: boolean;
  trailingIcon?: ReactNode;
  hoverIcon?: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>;

export function Pill<T extends ElementType = 'div'>({
  children,
  size = 'md',
  variant = 'default',
  className,
  interactive = false,
  trailingIcon,
  hoverIcon,
  as,
  ...rest
}: PillProps<T>): ReactElement {
  const Component = (as || 'div') as ElementType;
  const classes = [
    'ds-pill',
    `ds-pill--${size}`,
    `ds-pill--${variant}`,
    interactive ? 'ds-pill--interactive' : '',
    hoverIcon ? 'ds-pill--has-hover-icon' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Box component={Component} className={classes} {...rest}>
      {children}
      {trailingIcon ? (
        <Box className="ds-pill__icon" component="span">
          {trailingIcon}
        </Box>
      ) : null}
      {hoverIcon ? (
        <Box className="ds-pill__icon ds-pill__icon--hover" component="span">
          {hoverIcon}
        </Box>
      ) : null}
    </Box>
  );
}
