import type { ReactElement } from 'react';
import { Box } from '../../../mantine';
import { Button } from '../../inputs/Button/Button';

export type TabItem = {
  key: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onSelect: () => void;
};

type TabsProps = {
  items: TabItem[];
  className?: string;
};

export function Tabs({ items, className }: TabsProps): ReactElement {
  return (
    <Box
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--ds-space-xs)' }}
      className={className}
    >
      {items.map((item) => (
        <Button
          key={item.key}
          type="button"
          size="sm"
          variant="ghost"
          style={
            item.active
              ? {
                  background: 'var(--ds-color-accent-weak)',
                  borderColor: 'var(--ds-color-accent-strong)',
                }
              : { borderColor: 'transparent' }
          }
          disabled={item.disabled}
          onClick={item.onSelect}
          aria-current={item.active ? 'page' : undefined}
          aria-disabled={item.disabled ? true : undefined}
        >
          {item.label}
        </Button>
      ))}
    </Box>
  );
}
