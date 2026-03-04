import type { ReactElement } from 'react';
import { Box } from '../../../../mantine';
import { MaterialIcon } from '../../data-display/MaterialIcon/MaterialIcon';
import './Alert.css';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  message: string;
  className?: string;
};

export function Alert({ variant = 'info', title, message, className }: AlertProps): ReactElement {
  const rootClass = ['ds-alert', `ds-alert--${variant}`, className].filter(Boolean).join(' ');
  const iconMap: Record<AlertVariant, string> = {
    success: 'check_circle',
    info: 'info',
    warning: 'warning',
    error: 'error',
  };
  return (
    <Box className={rootClass} role="status">
      <Box className="ds-alert__icon" aria-hidden="true">
        <MaterialIcon name={iconMap[variant]} />
      </Box>
      {title ? <Box className="ds-alert__title">{title}</Box> : null}
      <Box className="ds-alert__message">{message}</Box>
    </Box>
  );
}
