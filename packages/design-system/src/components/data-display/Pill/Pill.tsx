import type {
  ComponentPropsWithoutRef,
  CSSProperties,
  ElementType,
  ReactElement,
  ReactNode,
} from 'react';
import { useState } from 'react';
import { Box } from '../../../mantine';

export type PillSize = 'xs' | 'sm' | 'md' | 'lg';
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

const sizeStyles: Record<PillSize, CSSProperties> = {
  xs: {
    // Tight enough to sit within a body-text line without pushing line-height.
    // At 11px / line-height 1 / 2px vertical padding → ~13px total height.
    padding: '1px var(--ds-space-xxs)',
    fontSize: '0.6875rem', // 11px
    lineHeight: '1',
  },
  sm: {
    padding: 'calc(var(--ds-space-xxs) + 2px) var(--ds-space-xs)',
    fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
    lineHeight: 'var(--ds-textScale-3-lineHeight, 1.2)',
  },
  md: {
    padding: 'var(--ds-space-xs) var(--ds-space-sm)',
    fontSize: 'var(--ds-textScale-4-fontSize, 14px)',
    lineHeight: 'var(--ds-textScale-4-lineHeight, 1.4)',
  },
  lg: {
    padding: 'var(--ds-space-xs) var(--ds-space-md)',
    fontSize: 'var(--ds-textScale-4-fontSize, 14px)',
    lineHeight: 'var(--ds-textScale-4-lineHeight, 1.4)',
  },
};

const variantStyles: Record<PillVariant, CSSProperties> = {
  default: {
    background: 'var(--ds-color-surface-muted)',
    borderColor: 'var(--ds-color-border)',
    color: 'var(--ds-color-text)',
  },
  accent: {
    background: 'var(--ds-color-accent-weak)',
    borderColor: 'var(--ds-color-accent-weak)',
    color: 'var(--ds-color-accent-strong)',
  },
};

export function Pill<T extends ElementType = 'div'>({
  children,
  size = 'md',
  variant = 'default',
  className,
  interactive = false,
  trailingIcon,
  hoverIcon,
  as,
  style: externalStyle,
  ...rest
}: PillProps<T> & { style?: CSSProperties }): ReactElement {
  const [hovered, setHovered] = useState(false);
  const Component = (as || 'div') as ElementType;

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--ds-space-xxs)',
    borderRadius: 'var(--ds-radius-pill)',
    fontWeight: 600,
    border: '1px solid var(--ds-color-border)',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...(interactive
      ? {
          cursor: 'pointer',
          transition: 'filter 0.15s ease',
          filter: hovered ? 'brightness(0.97)' : undefined,
        }
      : {}),
  };

  return (
    <Box
      component={Component}
      className={className}
      style={{ ...baseStyle, ...externalStyle }}
      onMouseEnter={interactive || hoverIcon ? () => setHovered(true) : undefined}
      onMouseLeave={interactive || hoverIcon ? () => setHovered(false) : undefined}
      {...rest}
    >
      {children}
      {trailingIcon ? (
        <Box
          component="span"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: 'var(--ds-space-xxs)',
            lineHeight: 1,
            color: 'inherit',
          }}
        >
          {trailingIcon}
        </Box>
      ) : null}
      {hoverIcon ? (
        <Box
          component="span"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            lineHeight: 1,
            color: 'inherit',
            opacity: hovered ? 1 : 0,
            width: hovered ? 'auto' : 0,
            marginLeft: hovered ? 'var(--ds-space-xxs)' : 0,
            overflow: 'hidden',
            transition: 'opacity 120ms ease, width 120ms ease, margin-left 120ms ease',
          }}
        >
          {hoverIcon}
        </Box>
      ) : null}
    </Box>
  );
}
