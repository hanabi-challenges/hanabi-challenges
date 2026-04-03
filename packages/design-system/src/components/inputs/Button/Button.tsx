import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactElement,
  ReactNode,
} from 'react';
import { useState } from 'react';
import { UnstyledButton } from '../../../mantine';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps<T extends ElementType = 'button'> = {
  as?: T;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Removes horizontal padding and makes the button square — use for icon-only buttons. */
  icon?: boolean;
  className?: string;
  disabled?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children' | 'disabled'>;

const baseStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--ds-color-accent-strong)',
    color: '#fff',
    borderColor: 'var(--ds-color-accent-strong)',
    boxShadow: 'var(--ds-shadow-light)',
  },
  secondary: {
    background: 'var(--ds-color-surface)',
    color: 'var(--ds-color-text)',
    borderColor: 'var(--ds-color-border)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--ds-color-text)',
    borderColor: 'transparent',
  },
};

const hoverStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    boxShadow: 'var(--ds-shadow-hover)',
  },
  secondary: {
    background: 'color-mix(in srgb, var(--ds-color-accent-weak) 25%, var(--ds-color-surface))',
    borderColor: 'var(--ds-color-accent-strong)',
    boxShadow: 'var(--ds-elevation-2, 0 4px 12px rgba(0, 0, 0, 0.08))',
  },
  ghost: {
    background: 'color-mix(in srgb, var(--ds-color-accent-weak) 20%, transparent)',
    borderColor: 'var(--ds-color-border)',
    boxShadow: 'var(--ds-elevation-2, 0 4px 12px rgba(0, 0, 0, 0.08))',
  },
};

const disabledStyles: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background:
      'color-mix(in srgb, var(--ds-color-accent-strong) 35%, var(--ds-color-surface) 65%)',
    borderColor:
      'color-mix(in srgb, var(--ds-color-accent-strong) 35%, var(--ds-color-border) 65%)',
    color: 'var(--ds-color-text-muted)',
  },
  secondary: {
    background: 'var(--ds-color-surface-muted)',
    borderColor: 'var(--ds-color-border)',
    color: 'var(--ds-color-text-muted)',
  },
  ghost: {
    background: 'transparent',
    borderColor: 'transparent',
    color: 'var(--ds-color-text-muted)',
  },
};

const sizeStyles: Record<ButtonSize, CSSProperties> = {
  md: {
    height: 'var(--ds-size-control-md-height)',
    minHeight: 'var(--ds-size-control-md-height)',
    padding: '0 var(--ds-size-control-md-paddingX)',
    lineHeight: '1',
    borderRadius: 'var(--ds-radius-md)',
  },
  sm: {
    height: 'var(--ds-size-control-sm-height)',
    minHeight: 'var(--ds-size-control-sm-height)',
    padding: '0 var(--ds-size-control-sm-paddingX)',
    lineHeight: '1',
    borderRadius: 'var(--ds-radius-sm)',
  },
};

const iconSizeStyles: Record<ButtonSize, CSSProperties> = {
  md: {
    height: 'var(--ds-size-control-md-height)',
    minHeight: 'var(--ds-size-control-md-height)',
    width: 'var(--ds-size-control-md-height)',
    padding: '0',
    lineHeight: '1',
    borderRadius: 'var(--ds-radius-md)',
  },
  sm: {
    height: 'var(--ds-size-control-sm-height)',
    minHeight: 'var(--ds-size-control-sm-height)',
    width: 'var(--ds-size-control-sm-height)',
    padding: '0',
    lineHeight: '1',
    borderRadius: 'var(--ds-radius-sm)',
  },
};

export function Button<T extends ElementType = 'button'>({
  as,
  children,
  variant = 'primary',
  size = 'md',
  icon = false,
  className,
  style,
  disabled = false,
  ...rest
}: ButtonProps<T> & { style?: CSSProperties }): ReactElement {
  const [hovered, setHovered] = useState(false);
  const isHovered = hovered && !disabled;

  const inlineStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--ds-space-xxs)',
    border: '1px solid transparent',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition:
      'background 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
    textDecoration: 'none',
    verticalAlign: 'middle',
    ...baseStyles[variant],
    ...(icon ? iconSizeStyles[size] : sizeStyles[size]),
    ...(isHovered ? hoverStyles[variant] : {}),
    ...(disabled ? disabledStyles[variant] : {}),
    ...style,
  };

  const typeProp =
    !as || as === 'button'
      ? { type: (rest as ComponentPropsWithoutRef<'button'>).type ?? 'button' }
      : {};

  return (
    <UnstyledButton
      component={(as ?? 'button') as 'button'}
      className={className}
      style={inlineStyle}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...typeProp}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </UnstyledButton>
  );
}
