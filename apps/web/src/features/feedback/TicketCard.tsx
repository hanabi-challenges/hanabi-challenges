import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Inline,
  MaterialIcon,
  Pill,
  Stack,
  Text,
} from '../../design-system';
import { STATUS_CONFIG, TYPE_LABELS, DOMAIN_LABELS } from './statusConfig';
import type { TicketSummary } from './types';

type TicketCardProps = {
  ticket: TicketSummary;
};

export function TicketCard({ ticket }: TicketCardProps): ReactElement {
  const navigate = useNavigate();
  const { label: statusLabel, tone: statusTone } = STATUS_CONFIG[ticket.status_slug] ?? {
    label: ticket.status_slug,
    tone: 'neutral' as const,
  };

  return (
    <Card variant="outline" interactive onClick={() => navigate(`/feedback/${ticket.id}`)}>
      <CardHeader>
        <Inline justify="space-between" align="start" wrap gap="sm">
          <Heading level={3} style={{ flex: 1, minWidth: 0 }}>
            {ticket.title}
          </Heading>
          <Badge tone={statusTone}>{statusLabel}</Badge>
        </Inline>
      </CardHeader>

      <CardBody>
        <Stack gap="xs">
          <Inline gap="xs" wrap align="center">
            <Pill size="sm" variant="default">
              {TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}
            </Pill>
            <Pill size="sm" variant="default">
              {DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}
            </Pill>
          </Inline>

          <Inline gap="md" align="center">
            <Inline gap="xs" align="center">
              <MaterialIcon name="arrow_upward" size={14} />
              <Text variant="caption">{ticket.vote_count ?? 0}</Text>
            </Inline>
            <Text variant="caption">
              {ticket.submitted_by_display_name} ·{' '}
              {new Date(ticket.created_at).toLocaleDateString()}
            </Text>
          </Inline>
        </Stack>
      </CardBody>
    </Card>
  );
}
