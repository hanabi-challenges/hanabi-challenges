// frontend/src/design-system/components/layout/Stack/Stack.tsx
import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import './Stack.css';

export type StackGap = 'none' | 'xs' | 'sm' | 'md' | 'lg';
export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type StackJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly';
export type StackDirection = 'column' | 'row';

export type StackProps = {
  children: ReactNode;
  as?: ElementType;

  /**
   * Spacing between children (maps to CSS gap).
   * Mirrors the same spacing scale as Inline.
   */
  gap?: StackGap;

  /**
   * Cross-axis alignment (align-items).
   * For the default column direction, this is horizontal alignment.
   */
  align?: StackAlign;

  /**
   * Main-axis distribution (justify-content).
   * For the default column direction, this is vertical distribution.
   */
  justify?: StackJustify;

  /**
   * Direction of the stack.
   * Defaults to "column". Prefer Inline for horizontal-only layouts.
   */
  direction?: StackDirection;

  /**
   * Allow items to wrap when direction="row".
   */
  wrap?: boolean;

  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'children'>;

export function Stack({
  children,
  as,
  gap = 'sm',
  align = 'stretch',
  justify = 'start',
  direction = 'column',
  wrap = false,
  className,
  ...rest
}: StackProps) {
  const Component = (as || 'div') as ElementType;
  const rootClassName = [
    'ui-stack',
    `ui-stack--direction-${direction}`,
    `ui-stack--gap-${gap}`,
    `ui-stack--align-${align}`,
    `ui-stack--justify-${justify}`,
    wrap && 'ui-stack--wrap',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={rootClassName} {...rest}>
      {children}
    </Component>
  );
}
