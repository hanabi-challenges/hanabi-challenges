import type { ComponentPropsWithoutRef, ElementType, ReactElement, ReactNode } from 'react';
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

export function Button<T extends ElementType = 'button'>({
  as,
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonProps<T>): ReactElement {
  const Component = (as || 'button') as ElementType;

  const rootClassName = ['ds-btn', `ds-btn--${variant}`, `ds-btn--${size}`, className]
    .filter(Boolean)
    .join(' ');

  // Only apply default type="button" when rendering a native button
  const typeProp =
    !as || Component === 'button'
      ? { type: (rest as ComponentPropsWithoutRef<'button'>).type ?? 'button' }
      : {};

  return (
    <Component className={rootClassName} {...typeProp} {...(rest as ComponentPropsWithoutRef<T>)}>
      {children}
    </Component>
  );
}
