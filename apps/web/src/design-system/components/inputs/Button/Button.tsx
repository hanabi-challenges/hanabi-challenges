import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactElement,
  ReactNode,
} from 'react';
import { UnstyledButton } from '../../../../mantine';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'sm';

export type ButtonProps<T extends ElementType = 'button'> = {
  as?: T;
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

const variantStyles: Record<ButtonVariant, CSSProperties> = {
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

export function Button<T extends ElementType = 'button'>({
  as,
  children,
  variant = 'primary',
  size = 'md',
  className,
  style,
  ...rest
}: ButtonProps<T> & { style?: CSSProperties }): ReactElement {
  const rootClassName = ['ds-btn', className].filter(Boolean).join(' ');

  const inlineStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--ds-space-xxs)',
    border: '1px solid transparent',
    fontWeight: 600,
    cursor: 'pointer',
    transition:
      'background 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
    textDecoration: 'none',
    verticalAlign: 'middle',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  };

  // Only apply default type="button" when rendering a native button
  const typeProp =
    !as || as === 'button'
      ? { type: (rest as ComponentPropsWithoutRef<'button'>).type ?? 'button' }
      : {};

  return (
    <UnstyledButton
      component={(as ?? 'button') as 'button'}
      className={rootClassName}
      data-variant={variant}
      data-size={size}
      style={inlineStyle}
      {...typeProp}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </UnstyledButton>
  );
}
