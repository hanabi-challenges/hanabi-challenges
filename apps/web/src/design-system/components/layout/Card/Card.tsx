// frontend/src/design-system/components/layout/Card/Card.tsx
import type {
  AnchorHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from 'react';
import { Box, Paper } from '../../../../mantine';
import './Card.css';

export type CardVariant = 'elevated' | 'outline' | 'subtle' | 'ghost';
export type CardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg';

type CommonProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: CSSProperties['maxWidth'];
  separated?: boolean;

  // visual
  variant?: CardVariant;
  tone?: CardTone;
  padding?: CardPadding;

  // behavior
  interactive?: boolean;
  disabled?: boolean;

  // shared click handler type that works for both container and anchor roots
  onClick?: MouseEventHandler<HTMLDivElement | HTMLAnchorElement>;

  'aria-label'?: string;
};

export type DivCardProps = CommonProps &
  Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children' | 'onClick'> & {
    href?: undefined;
  };

export type AnchorCardProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children' | 'onClick'> & {
    href: string;
  };

export type CardProps = DivCardProps | AnchorCardProps;

// Overloads so consumers get correct intellisense for href/no-href cases
export function Card(props: AnchorCardProps): ReactElement;
export function Card(props: DivCardProps): ReactElement;
export function Card(props: CardProps): ReactElement {
  // Anchor branch: href present and is a string
  if ('href' in props && typeof props.href === 'string') {
    const {
      children,
      className,
      maxWidth,
      variant = 'elevated',
      tone = 'neutral',
      padding = 'md',
      interactive,
      disabled = false,
      separated = false,
      href,
      onClick,
      'aria-label': ariaLabel,
      ...rest
    } = props as AnchorCardProps;

    const isInteractive = !disabled && (interactive || !!href || !!onClick);

    const rootClassName = [
      'ui-card',
      `ui-card--variant-${variant}`,
      `ui-card--tone-${tone}`,
      `ui-card--padding-${padding}`,
      isInteractive && 'ui-card--interactive',
      disabled && 'ui-card--disabled',
      separated && 'ui-card--separated',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    const style: CSSProperties | undefined = maxWidth ? { maxWidth } : undefined;

    return (
      <Paper
        component="a"
        className={rootClassName}
        style={style}
        href={href}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </Paper>
    );
  }

  // Div branch: no href
  const {
    children,
    className,
    maxWidth,
    variant = 'elevated',
    tone = 'neutral',
    padding = 'md',
    interactive,
    disabled = false,
    separated = false,
    onClick,
    'aria-label': ariaLabel,
    ...rest
  } = props as DivCardProps;

  const isInteractive = !disabled && (interactive || !!onClick);

  const rootClassName = [
    'ui-card',
    `ui-card--variant-${variant}`,
    `ui-card--tone-${tone}`,
    `ui-card--padding-${padding}`,
    isInteractive && 'ui-card--interactive',
    disabled && 'ui-card--disabled',
    separated && 'ui-card--separated',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const style: CSSProperties | undefined = maxWidth ? { maxWidth } : undefined;

  return (
    <Box
      className={rootClassName}
      style={style}
      onClick={onClick as MouseEventHandler<HTMLDivElement> | undefined}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </Box>
  );
}
