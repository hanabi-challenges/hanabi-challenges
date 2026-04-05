import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, CardBody, Grid, Inline, Stack, StatBlock, Text } from '../../design-system';
import { UserPill } from '../users/UserPill';
import { STATUS_CONFIG, TYPE_LABELS, DOMAIN_LABELS } from './statusConfig';
import type { TicketSummary } from './types';

type TicketCardProps = {
  ticket: TicketSummary;
};

const separatorStyle = {
  paddingRight: 'var(--ds-space-md)',
  marginRight: 'var(--ds-space-md)',
  borderRight: '1px solid var(--ds-color-border)',
  minWidth: 80,
} as const;

export function TicketCard({ ticket }: TicketCardProps): ReactElement {
  const navigate = useNavigate();
  const { label: statusLabel, tone: statusTone } = STATUS_CONFIG[ticket.status_slug] ?? {
    label: ticket.status_slug,
    tone: 'neutral' as const,
  };

  const date = new Date(ticket.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <Card variant="outline" interactive onClick={() => navigate(`/feedback/${ticket.id}`)}>
      <CardBody>
        <Grid columns="max-content 1fr" gap="none" style={{ gridTemplateRows: '1fr auto' }}>
          {/* Left top: stats */}
          <Stack
            align="center"
            justify="center"
            gap="sm"
            style={{ ...separatorStyle, paddingBottom: 'var(--ds-space-xs)' }}
          >
            <StatBlock value={ticket.vote_count ?? 0} label="votes" />
            <StatBlock value={ticket.comment_count ?? 0} label="comments" />
          </Stack>

          {/* Right top: title + description */}
          <Stack gap="xs" style={{ minWidth: 0, paddingBottom: 'var(--ds-space-xs)' }}>
            <Text variant="body" weight="semibold" truncate>
              {ticket.title}
            </Text>
            {ticket.description && (
              <Text variant="caption" lineClamp={2}>
                {ticket.description}
              </Text>
            )}
          </Stack>

          {/* Left bottom: status badge */}
          <Stack align="center" justify="center" style={separatorStyle}>
            <Badge size="sm" tone={statusTone}>
              {statusLabel}
            </Badge>
          </Stack>

          {/* Right bottom: tags + attribution */}
          <Inline justify="space-between" align="center" wrap gap="xs">
            <Inline gap="xs" wrap align="center">
              <Badge size="sm">{TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}</Badge>
              <Badge size="sm">{DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}</Badge>
            </Inline>
            <Inline gap="xs" align="center">
              <Text variant="caption">{date} ·</Text>
              <UserPill
                name={ticket.submitted_by_display_name}
                color={ticket.submitted_by_color_hex}
                textColor={ticket.submitted_by_text_color}
              />
            </Inline>
          </Inline>
        </Grid>
      </CardBody>
    </Card>
  );
}
