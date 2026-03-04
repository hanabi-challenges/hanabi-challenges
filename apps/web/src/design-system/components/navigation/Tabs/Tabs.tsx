import type { ReactElement } from 'react';
import { Box } from '../../../../mantine';
import { Button } from '../../inputs/Button/Button';
import './Tabs.css';

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
    <Box className={['ds-tabs', className].filter(Boolean).join(' ')}>
      {items.map((item) => (
        <Button
          key={item.key}
          type="button"
          size="sm"
          variant="ghost"
          className={['ds-tabs__item', item.active && 'ds-tabs__item--active']
            .filter(Boolean)
            .join(' ')}
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
