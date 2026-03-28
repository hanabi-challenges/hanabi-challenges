import type { ReactElement, ReactNode } from 'react';
import { Box, Modal as MantineModal, UnstyledButton } from '../../../mantine';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
};

/**
 * Modal overlay with backdrop, close button, and simple click-outside handling.
 * Note: focus trap/escape key can be added later if needed.
 */
export function Modal({ open, onClose, children, maxWidth = '720px' }: ModalProps): ReactElement {
  return (
    <MantineModal
      opened={open}
      onClose={onClose}
      withCloseButton={false}
      size={maxWidth}
      centered
      styles={{
        content: {
          borderRadius: 'var(--ds-radius-md)',
          border: '1px solid var(--ds-color-border)',
        },
        body: {
          padding: 'var(--ds-space-md)',
        },
      }}
    >
      <Box style={{ position: 'relative' }}>
        <UnstyledButton
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            border: '1px solid var(--ds-color-border)',
            borderRadius: 'var(--ds-radius-sm)',
            cursor: 'pointer',
            padding: 'var(--ds-space-xxs) var(--ds-space-xs)',
          }}
        >
          ×
        </UnstyledButton>
        <Box style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-sm)' }}>
          {children}
        </Box>
      </Box>
    </MantineModal>
  );
}
