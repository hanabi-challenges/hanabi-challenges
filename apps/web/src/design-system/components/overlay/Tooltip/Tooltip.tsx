import type { CSSProperties, HTMLAttributes, ReactElement, ReactNode } from 'react';
import { useId, useState } from 'react';
import { Box } from '../../../../mantine';
import './Tooltip.css';

type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export type TooltipProps = {
  content: ReactNode;
  placement?: TooltipPlacement;
  maxWidth?: number | string;
  minWidth?: number | string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children'>;

export function Tooltip({
  content,
  placement = 'top',
  maxWidth = 'min(360px, 80vw)',
  minWidth = '200px',
  children,
  ...rest
}: TooltipProps): ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();
  const styleVars: CSSProperties = {
    '--ds-tooltip-max-width':
      typeof maxWidth === 'number' ? `${maxWidth}px` : (maxWidth as CSSProperties['maxWidth']),
    '--ds-tooltip-min-width':
      typeof minWidth === 'number' ? `${minWidth}px` : (minWidth as CSSProperties['minWidth']),
  };

  return (
    <Box
      component="span"
      className="ds-tooltip__trigger"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
      {...rest}
    >
      {children}
      {open && (
        <Box
          component="span"
          id={id}
          className={`ds-tooltip ds-tooltip--${placement}`}
          style={styleVars}
          role="tooltip"
        >
          {content}
        </Box>
      )}
    </Box>
  );
}
