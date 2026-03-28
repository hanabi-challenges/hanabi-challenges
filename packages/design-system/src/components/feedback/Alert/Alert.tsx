import type { CSSProperties, ReactElement } from 'react';
import { Alert as MantineAlert } from '../../../mantine';
import { MaterialIcon } from '../../data-display/MaterialIcon/MaterialIcon';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

type AlertProps = {
  variant?: AlertVariant;
  title?: string;
  message: string;
  className?: string;
};

type AlertTokens = { bg: string; text: string };

const variantTokens: Record<AlertVariant, AlertTokens> = {
  info: {
    bg: 'var(--ds-color-alert-info-bg)',
    text: 'var(--ds-color-alert-info-text)',
  },
  success: {
    bg: 'var(--ds-color-alert-success-bg)',
    text: 'var(--ds-color-alert-success-text)',
  },
  warning: {
    bg: 'var(--ds-color-alert-warning-bg)',
    text: 'var(--ds-color-alert-warning-text)',
  },
  error: {
    bg: 'var(--ds-color-alert-error-bg)',
    text: 'var(--ds-color-alert-error-text)',
  },
};

const iconMap: Record<AlertVariant, string> = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
};

export function Alert({ variant = 'info', title, message, className }: AlertProps): ReactElement {
  const { bg, text } = variantTokens[variant];
  return (
    <MantineAlert
      variant="default"
      title={title}
      icon={<MaterialIcon name={iconMap[variant]} />}
      className={className}
      role="status"
      styles={{
        root: { background: bg, borderColor: text } as CSSProperties,
        title: { color: text } as CSSProperties,
        body: { color: text } as CSSProperties,
        icon: { color: text } as CSSProperties,
      }}
    >
      {message}
    </MantineAlert>
  );
}
