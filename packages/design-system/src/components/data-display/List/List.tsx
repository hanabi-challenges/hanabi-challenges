import type { ReactElement, ReactNode } from 'react';
import { List as MantineList } from '../../../mantine';

type ListItemType = {
  key?: string | number;
  content: ReactNode;
  icon?: ReactNode;
};

type ListProps = {
  items: ListItemType[];
  type?: 'unordered' | 'ordered';
  spacing?: 'xs' | 'sm' | 'md';
  className?: string;
};

/**
 * List
 * Styled list component for bulleted/numbered lists.
 */
export function List({
  items,
  type = 'unordered',
  spacing = 'xs',
  className,
}: ListProps): ReactElement {
  return (
    <MantineList
      type={type === 'ordered' ? 'ordered' : 'unordered'}
      spacing={spacing}
      className={className}
    >
      {items.map((item, idx) => (
        <MantineList.Item key={item.key ?? idx} icon={item.icon}>
          {item.content}
        </MantineList.Item>
      ))}
    </MantineList>
  );
}
