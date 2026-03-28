import { Badge } from '@mantine/core';
import type { StatusSlug } from '@tracker/types';

const STATUS_COLORS: Record<StatusSlug, string> = {
  submitted: 'blue',
  triaged: 'indigo',
  in_review: 'violet',
  decided: 'yellow',
  resolved: 'green',
  rejected: 'red',
  closed: 'gray',
};

interface TicketStatusBadgeProps {
  status: StatusSlug;
}

export function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  const color = STATUS_COLORS[status];
  const label = status.replace(/_/g, ' ');
  return (
    <Badge color={color} variant="light">
      {label}
    </Badge>
  );
}
