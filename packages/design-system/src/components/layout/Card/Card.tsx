// frontend/src/design-system/components/layout/Card/Card.tsx
import type {
  AnchorHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  MouseEventHandler,
  ReactElement,
  ReactNode,
} from 'react';
import { useState } from 'react';
import { Box, Paper } from '../../../mantine';

export type CardVariant = 'elevated' | 'outline' | 'subtle' | 'ghost';
export type CardTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg';

const paddingMap: Record<CardPadding, string> = {
  none: '0',
  xs: 'var(--ds-space-xs)',
  sm: 'var(--ds-space-sm)',
  md: 'var(--ds-space-md)',
  lg: 'var(--ds-space-lg)',
};

function getVariantStyle(variant: CardVariant): CSSProperties {
  switch (variant) {
    case 'elevated':
      return {
        boxShadow: 'var(--ds-elevation-2, 0 4px 12px rgba(0, 0, 0, 0.08))',
        borderColor: 'var(--ds-color-border)',
      };
    case 'outline':
      return {
        boxShadow: 'none',
        borderColor: 'var(--ds-color-border)',
      };
    case 'subtle':
      return {
        boxShadow: 'none',
        borderColor: 'var(--ds-color-border)',
        background: 'var(--ds-color-surface-muted)',
      };
    case 'ghost':
      return {
        boxShadow: 'none',
        borderColor: 'transparent',
        background: 'transparent',
      };
  }
}

function getToneStyle(tone: CardTone): CSSProperties {
  switch (tone) {
    case 'neutral':
      return {};
    case 'info':
      return {
        background: 'color-mix(in srgb, var(--ds-color-accent-weak) 20%, transparent)',
      };
    case 'success':
      return {
        background:
          'color-mix(in srgb, var(--ds-color-categorical-cat6-light, #14b8a6) 12%, transparent)',
      };
    case 'warning':
      return {
        background:
          'color-mix(in srgb, var(--ds-color-categorical-cat4-light, #d97706) 12%, transparent)',
      };
    case 'danger':
      return {
        background: 'color-mix(in srgb, var(--ds-color-scale-amber-5, #b45309) 12%, transparent)',
      };
  }
}

type CommonProps = {
  children: ReactNode;
  className?: string;
  maxWidth?: CSSProperties['maxWidth'];
  separated?: boolean;
  ref?: ((node: HTMLElement | null) => void) | null;

  // visual
  variant?: CardVariant;
  tone?: CardTone;
  padding?: CardPadding;
  style?: CSSProperties;

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

function buildCardStyle(
  variant: CardVariant,
  tone: CardTone,
  padding: CardPadding,
  isInteractive: boolean,
  disabled: boolean,
  hovered: boolean,
  maxWidth?: CSSProperties['maxWidth'],
): CSSProperties {
  const base: CSSProperties = {
    display: 'block',
    maxWidth: maxWidth ?? '100%',
    borderRadius: 'var(--ds-radius-md)',
    border: '1px solid var(--ds-color-border)',
    background: 'var(--ds-color-surface-muted)',
    color: 'var(--ds-color-text)',
    textDecoration: 'none',
    position: 'relative',
    padding: paddingMap[padding],
    ...getVariantStyle(variant),
    ...getToneStyle(tone),
  };

  if (isInteractive) {
    base.cursor = 'pointer';
    base.transition =
      'box-shadow 120ms ease, transform 120ms ease, border-color 120ms ease, background-color 120ms ease';
    // Always set backgroundColor explicitly (not just on hover) so the CSS
    // transition has two concrete values to interpolate between. Without this,
    // removing the inline backgroundColor on mouse-leave causes the browser to
    // skip the transition and snap to the shorthand-computed value.
    const restingBackground = (base.background as string) || 'var(--ds-color-surface)';
    if (hovered) {
      base.boxShadow = 'var(--ds-elevation-3, 0 6px 16px rgba(0, 0, 0, 0.12))';
      base.transform = 'translateY(-1px)';
      base.backgroundColor = `color-mix(in srgb, var(--ds-color-accent-weak) 25%, ${restingBackground})`;
    } else {
      base.backgroundColor = restingBackground;
    }
  }

  if (disabled) {
    base.opacity = 0.5;
    base.cursor = 'not-allowed';
    base.pointerEvents = 'none';
  }

  return base;
}

// Overloads so consumers get correct intellisense for href/no-href cases
export function Card(props: AnchorCardProps): ReactElement;
export function Card(props: DivCardProps): ReactElement;
export function Card(props: CardProps): ReactElement {
  const [hovered, setHovered] = useState(false);

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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      separated: _sep,
      href,
      onClick,
      style: styleOverride,
      'aria-label': ariaLabel,
      ...rest
    } = props as AnchorCardProps;

    const isInteractive = !disabled && (interactive || !!href || !!onClick);
    const cardStyle = buildCardStyle(
      variant,
      tone,
      padding,
      isInteractive,
      disabled,
      hovered,
      maxWidth,
    );

    return (
      <Paper
        component="a"
        className={className}
        style={styleOverride ? { ...cardStyle, ...styleOverride } : cardStyle}
        href={href}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement> | undefined}
        onMouseEnter={isInteractive ? () => setHovered(true) : undefined}
        onMouseLeave={isInteractive ? () => setHovered(false) : undefined}
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    separated: _sep2,
    onClick,
    style: styleOverride,
    'aria-label': ariaLabel,
    ...rest
  } = props as DivCardProps;

  const isInteractive = !disabled && (interactive || !!onClick);
  const cardStyle = buildCardStyle(
    variant,
    tone,
    padding,
    isInteractive,
    disabled,
    hovered,
    maxWidth,
  );

  return (
    <Box
      className={className}
      style={styleOverride ? { ...cardStyle, ...styleOverride } : cardStyle}
      onClick={onClick as MouseEventHandler<HTMLDivElement> | undefined}
      onMouseEnter={isInteractive ? () => setHovered(true) : undefined}
      onMouseLeave={isInteractive ? () => setHovered(false) : undefined}
      aria-disabled={disabled || undefined}
      aria-label={ariaLabel}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {children}
    </Box>
  );
}
