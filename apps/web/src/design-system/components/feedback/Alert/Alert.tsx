import type { ReactElement } from 'react';
import { Alert as MantineAlert } from '../../../../mantine';
import { MaterialIcon } from '../../data-display/MaterialIcon/MaterialIcon';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  message: string;
  className?: string;
};

const colorMap: Record<AlertVariant, string> = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

const iconMap: Record<AlertVariant, string> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

export function Alert({ variant = 'info', title, message, className }: AlertProps): ReactElement {
  return (
    <MantineAlert
      color={colorMap[variant]}
      title={title}
      icon={<MaterialIcon name={iconMap[variant]} />}
      className={className}
      role="status"
    >
      {message}
    </MantineAlert>
  );
}
