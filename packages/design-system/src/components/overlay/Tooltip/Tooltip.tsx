import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import { Tooltip as MantineTooltip } from '../../../mantine';

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
}: TooltipProps): ReactElement {
  const maxWidthStr = typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth;
  const minWidthStr = typeof minWidth === 'number' ? `${minWidth}px` : minWidth;

  return (
    <MantineTooltip
      label={content}
      position={placement}
      styles={{
        tooltip: {
          maxWidth: maxWidthStr,
          minWidth: minWidthStr,
          background: 'var(--ds-color-surface)',
          color: 'var(--ds-color-text)',
          border: '1px solid var(--ds-color-border)',
          borderRadius: 'var(--ds-radius-sm)',
          boxShadow: 'var(--ds-shadow-light)',
          fontSize: 'var(--ds-textScale-3-fontSize, 12px)',
          lineHeight: '1.3',
          wordBreak: 'break-word',
          whiteSpace: 'normal',
        },
      }}
    >
      {/* Mantine tooltip requires a single child that accepts refs */}
      <span>{children}</span>
    </MantineTooltip>
  );
}
