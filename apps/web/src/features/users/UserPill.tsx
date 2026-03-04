import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import { Pill } from '../../design-system';

type UserPillBaseProps = {
  name: string;
  color?: string | null;
  textColor?: string | null;
};

export type UserPillProps = UserPillBaseProps &
  Omit<ComponentPropsWithoutRef<typeof Pill>, 'children' | 'variant'>;

/**
 * UserPill
 * Feature-scoped pill that applies user-specific color/text styling while
 * delegating layout/size/interaction to the design-system Pill.
 */
export function UserPill({ name, color, textColor, style, size = 'sm', ...rest }: UserPillProps) {
  const mergedStyle: CSSProperties = {
    ...(style || {}),
  };
  if (color) {
    mergedStyle.background = color;
    mergedStyle.borderColor = color;
  }
  if (textColor) {
    mergedStyle.color = textColor;
  }

  return (
    <Pill size={size} variant="default" interactive style={mergedStyle} {...rest}>
      {name}
    </Pill>
  );
}
