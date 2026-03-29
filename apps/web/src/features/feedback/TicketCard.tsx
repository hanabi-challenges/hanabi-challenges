import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Card, CardBody, Inline, Pill, Text } from '../../design-system';
import { UserPill } from '../users/UserPill';
import { STATUS_CONFIG, TYPE_LABELS, DOMAIN_LABELS } from './statusConfig';
import type { TicketSummary } from './types';

type TicketCardProps = {
  ticket: TicketSummary;
};

function Stat({ value, label }: { value: number; label: string }): ReactElement {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        whiteSpace: 'nowrap',
      }}
    >
      <Text variant="body" style={{ fontWeight: 700, lineHeight: 1 }}>
        {value}
      </Text>
      <Text variant="caption" style={{ color: 'var(--ds-color-text-muted)', lineHeight: 1.4 }}>
        {label}
      </Text>
    </div>
  );
}

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            gap: 'var(--ds-space-md)',
            alignItems: 'start',
          }}
        >
          {/* Left: stats + status badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--ds-space-sm)',
              paddingTop: 2,
              minWidth: 80,
            }}
          >
            <Stat value={ticket.vote_count ?? 0} label="votes" />
            <Stat value={ticket.comment_count ?? 0} label="comments" />
            <Badge tone={statusTone} style={{ whiteSpace: 'nowrap' }}>
              {statusLabel}
            </Badge>
          </div>

          {/* Right: title, description, tags, attribution */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--ds-space-xs)',
              minWidth: 0,
            }}
          >
            <Text
              variant="body"
              style={{
                fontWeight: 600,
                fontSize: 'var(--ds-textScale-1-fontSize)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {ticket.title}
            </Text>

            {ticket.description && (
              <Text
                variant="caption"
                style={{
                  color: 'var(--ds-color-text-muted)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {ticket.description}
              </Text>
            )}

            <Inline gap="xs" wrap align="center">
              <Pill size="sm" variant="default">
                {TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}
              </Pill>
              <Pill size="sm" variant="default">
                {DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}
              </Pill>
            </Inline>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 'var(--ds-space-xs)',
              }}
            >
              <Text variant="caption" style={{ color: 'var(--ds-color-text-muted)' }}>
                {date} ·
              </Text>
              <UserPill
                name={ticket.submitted_by_display_name}
                color={ticket.submitted_by_color_hex}
                textColor={ticket.submitted_by_text_color}
              />
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
