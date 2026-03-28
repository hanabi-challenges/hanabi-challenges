import type { CSSProperties, ReactElement } from 'react';
import { Box } from '../../../mantine';

type MaterialIconProps = {
  name: string;
  ariaLabel?: string;
  ariaHidden?: boolean;
  size?: number;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export function MaterialIcon({
  name,
  ariaLabel,
  ariaHidden = true,
  size,
  title,
  className,
  style,
}: MaterialIconProps): ReactElement {
  return (
    <Box
      component="span"
      className={['material-symbols-outlined', className].filter(Boolean).join(' ')}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      title={title}
      style={size ? { fontSize: size, ...style } : style}
    >
      {name}
    </Box>
  );
}
