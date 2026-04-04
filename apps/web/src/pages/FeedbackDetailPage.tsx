import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Heading,
  Inline,
  Main,
  MaterialIcon,
  Modal,
  PageContainer,
  PageHeader,
  Section,
  Stack,
  Text,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { VoteButton } from '../features/feedback/VoteButton';
import { UserPill } from '../features/users/UserPill';
import { MarkdownRenderer, type MentionColorMap } from '../ui/MarkdownRenderer';
import { MarkdownEditor } from '../ui/MarkdownEditor';
import {
  getTicket,
  getTicketHistory,
  getTicketComments,
  getVoteState,
  getPinState,
  setPinned,
  getSubscriptionState,
  setSubscribed,
  createComment,
  searchMentionUsers,
} from '../features/feedback/api';
import {
  STATUS_CONFIG,
  TYPE_LABELS,
  DOMAIN_LABELS,
  SEVERITY_LABELS,
  REPRODUCIBILITY_LABELS,
} from '../features/feedback/statusConfig';
import type {
  TicketDetail,
  TicketHistoryEntry,
  TicketComment,
  TicketVoteState,
  TicketPinState,
  TicketSubscriptionState,
} from '../features/feedback/types';
import './FeedbackDetailPage.css';

type TimelineEntry =
  | { kind: 'history'; ts: string; data: TicketHistoryEntry }
  | { kind: 'comment'; ts: string; data: TicketComment };

function buildTimeline(history: TicketHistoryEntry[], comments: TicketComment[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...history.map((h) => ({ kind: 'history' as const, ts: h.created_at, data: h })),
    ...comments.map((c) => ({ kind: 'comment' as const, ts: c.created_at, data: c })),
  ];
  return entries.sort((a, b) => a.ts.localeCompare(b.ts));
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [voteState, setVoteState] = useState<TicketVoteState | null>(null);
  const [pinState, setPinState] = useState<TicketPinState | null>(null);
  const [subscriptionState, setSubscriptionState] = useState<TicketSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [pinBusy, setPinBusy] = useState(false);
  const [subscribeBusy, setSubscribeBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getTicket(id),
      getTicketHistory(id),
      getTicketComments(id),
      getVoteState(id, token),
      getPinState(id, token),
      getSubscriptionState(id, token),
    ])
      .then(([t, { history }, { comments }, votes, pins, subs]) => {
        setTicket(t);
        setTimeline(buildTimeline(history, comments));
        setVoteState(votes);
        setPinState(pins);
        setSubscriptionState(subs);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load ticket.');
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  const togglePin = async () => {
    if (!token) {
      setLoginModalOpen(true);
      return;
    }
    if (!id || !pinState || pinBusy) return;
    setPinBusy(true);
    try {
      const next = await setPinned(id, !pinState.is_pinned, token);
      setPinState(next);
    } finally {
      setPinBusy(false);
    }
  };

  const toggleSubscription = async () => {
    if (!token) {
      setLoginModalOpen(true);
      return;
    }
    if (!id || !subscriptionState || subscribeBusy) return;
    setSubscribeBusy(true);
    try {
      const next = await setSubscribed(id, !subscriptionState.is_subscribed, token);
      setSubscriptionState(next);
    } finally {
      setSubscribeBusy(false);
    }
  };

  const searchMentions = token
    ? (q: string) => searchMentionUsers(q, token).then((r) => r.users)
    : undefined;

  // Build a display_name → color map from all loaded user data so that
  // @mention pills in ticket descriptions and comments render with their colors.
  const mentionColors = useMemo<MentionColorMap>(() => {
    const map: MentionColorMap = {};
    if (ticket) {
      map[ticket.submitted_by_display_name] = {
        color_hex: ticket.submitted_by_color_hex,
        text_color: ticket.submitted_by_text_color,
      };
    }
    for (const entry of timeline) {
      if (entry.kind === 'history') {
        map[entry.data.changed_by_display_name] = {
          color_hex: entry.data.changed_by_color_hex,
          text_color: entry.data.changed_by_text_color,
        };
      } else {
        map[entry.data.author_display_name] = {
          color_hex: entry.data.author_color_hex,
          text_color: entry.data.author_text_color,
        };
      }
    }
    return map;
  }, [ticket, timeline]);

  const submitComment = async () => {
    if (!id || !token || !commentBody.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      await createComment(id, { body: commentBody.trim() }, token);
      const [{ history }, { comments }] = await Promise.all([
        getTicketHistory(id),
        getTicketComments(id),
      ]);
      setTimeline(buildTimeline(history, comments));
      setCommentBody('');
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setCommentBusy(false);
    }
  };

  if (loading) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg">
            <Text variant="muted">Loading…</Text>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  if (error || !ticket) {
    return (
      <Main>
        <PageContainer>
          <Section paddingY="lg">
            <Alert variant="error" message={error ?? 'Ticket not found.'} />
            <Button variant="secondary" onClick={() => navigate('/feedback')}>
              Back to feedback
            </Button>
          </Section>
        </PageContainer>
      </Main>
    );
  }

  const { label: statusLabel, tone: statusTone } = STATUS_CONFIG[ticket.status_slug] ?? {
    label: ticket.status_slug,
    tone: 'neutral' as const,
  };

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" baseLevel={1}>
          <Stack gap="sm">
            {/* Back nav */}
            <Button variant="ghost" size="sm" onClick={() => navigate('/feedback')}>
              <Inline gap="xxs" align="center">
                <MaterialIcon name="chevron_left" size={14} />
                Feedback
              </Inline>
            </Button>

            <div className="feedback-detail__layout">
              {/* Content column — right on desktop, top on mobile */}
              <div className="feedback-detail__content">
                <Stack gap="md">
                  {/* Title + status badge */}
                  <PageHeader
                    title={ticket.title}
                    actions={<Badge tone={statusTone}>{statusLabel}</Badge>}
                  />

                  {/* Description — rendered as markdown */}
                  <MarkdownRenderer markdown={ticket.description} mentionColors={mentionColors} />

                  {/* Metadata: type/domain/severity badges left, attribution right */}
                  <Inline justify="space-between" align="center" wrap>
                    <Inline gap="xs" align="center" wrap>
                      <Badge size="sm">{TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}</Badge>
                      <Badge size="sm">
                        {DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}
                      </Badge>
                      {ticket.severity ? (
                        <Badge size="sm">
                          {SEVERITY_LABELS[ticket.severity] ?? ticket.severity}
                        </Badge>
                      ) : null}
                      {ticket.reproducibility ? (
                        <Badge size="sm">
                          {REPRODUCIBILITY_LABELS[ticket.reproducibility] ?? ticket.reproducibility}
                        </Badge>
                      ) : null}
                    </Inline>
                    <Inline gap="xs" align="center">
                      <UserPill
                        name={ticket.submitted_by_display_name}
                        color={ticket.submitted_by_color_hex}
                        textColor={ticket.submitted_by_text_color}
                      />
                      <Text variant="caption">{formatDate(ticket.created_at)}</Text>
                      {ticket.updated_at !== ticket.created_at ? (
                        <Text variant="caption">(updated {formatDate(ticket.updated_at)})</Text>
                      ) : null}
                    </Inline>
                  </Inline>

                  {/* Activity timeline — entries + comment box connected by a vertical line */}
                  <div className="activity-timeline">
                    {timeline.map((entry) =>
                      entry.kind === 'history' ? (
                        <HistoryEntry key={entry.data.id} entry={entry.data} />
                      ) : (
                        <CommentEntry
                          key={entry.data.id}
                          comment={entry.data}
                          mentionColors={mentionColors}
                        />
                      ),
                    )}

                    {/* Terminal node: comment input (logged-in) or login prompt */}
                    {token ? (
                      <div className="timeline-row">
                        <div className="timeline-node">
                          <MaterialIcon name="edit" size={12} />
                        </div>
                        <div className="timeline-content">
                          <Stack gap="sm">
                            <MarkdownEditor
                              value={commentBody}
                              onChange={setCommentBody}
                              placeholder="Write a comment…"
                              rows={5}
                              disabled={commentBusy}
                              onMentionSearch={searchMentions}
                            />
                            {commentError ? <Alert variant="error" message={commentError} /> : null}
                            <Inline justify="start">
                              <Button
                                variant="primary"
                                size="md"
                                onClick={() => void submitComment()}
                                disabled={commentBusy || !commentBody.trim()}
                              >
                                {commentBusy ? 'Posting…' : 'Post comment'}
                              </Button>
                            </Inline>
                          </Stack>
                        </div>
                      </div>
                    ) : (
                      <div className="timeline-row">
                        <div className="timeline-node">
                          <MaterialIcon name="lock" size={12} />
                        </div>
                        <div className="timeline-content">
                          <Text variant="caption">
                            <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                              Log in
                            </Button>{' '}
                            to leave a comment.
                          </Text>
                        </div>
                      </div>
                    )}
                  </div>
                </Stack>
              </div>

              {/* Actions column — left on desktop, bottom on mobile */}
              <div className="feedback-detail__actions">
                <Stack gap="md" align="center">
                  {/* Vote */}
                  {voteState ? (
                    <VoteButton
                      voteState={voteState}
                      token={token}
                      onVoteChange={setVoteState}
                      onLoginRequired={() => setLoginModalOpen(true)}
                    />
                  ) : null}

                  {/* Pin + follow */}
                  <Stack gap="xs" align="center">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      onClick={() => void togglePin()}
                      disabled={pinBusy}
                      aria-label={pinState?.is_pinned ? 'Unpin' : 'Pin to top of feed'}
                    >
                      <MaterialIcon
                        name="push_pin"
                        size={18}
                        style={
                          pinState?.is_pinned
                            ? {
                                color: 'var(--ds-color-accent-strong)',
                                fontVariationSettings: "'FILL' 1",
                              }
                            : undefined
                        }
                      />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      onClick={() => void toggleSubscription()}
                      disabled={subscribeBusy}
                      aria-label={
                        subscriptionState?.is_subscribed ? 'Unsubscribe' : 'Subscribe to updates'
                      }
                    >
                      <MaterialIcon
                        name={
                          subscriptionState?.is_subscribed ? 'notifications' : 'notifications_none'
                        }
                        size={18}
                        style={
                          subscriptionState?.is_subscribed
                            ? {
                                color: 'var(--ds-color-accent-strong)',
                                fontVariationSettings: "'FILL' 1",
                              }
                            : undefined
                        }
                      />
                    </Button>
                  </Stack>
                </Stack>
              </div>

              {/* Login prompt modal */}
              <Modal
                open={loginModalOpen}
                onClose={() => setLoginModalOpen(false)}
                maxWidth="360px"
              >
                <Heading level={3}>Log in to continue</Heading>
                <Text variant="body">
                  You need to be logged in to vote, pin, or subscribe to tickets.
                </Text>
                <Inline gap="sm">
                  <Button variant="primary" onClick={() => navigate('/login')}>
                    Log in
                  </Button>
                  <Button variant="secondary" onClick={() => setLoginModalOpen(false)}>
                    Cancel
                  </Button>
                </Inline>
              </Modal>
            </div>
          </Stack>
        </Section>
      </PageContainer>
    </Main>
  );
}

function HistoryEntry({ entry }: { entry: TicketHistoryEntry }) {
  const toLabel = STATUS_CONFIG[entry.to_status_slug]?.label ?? entry.to_status_slug;
  const action = entry.from_status_slug
    ? `changed the status to ${toLabel}`
    : `opened the ticket as ${toLabel}`;
  return (
    <div className="timeline-row">
      <div className="timeline-node">
        <MaterialIcon name="swap_horiz" size={12} />
      </div>
      <div className="timeline-content">
        <Inline gap="xs" align="center">
          <UserPill
            name={entry.changed_by_display_name}
            color={entry.changed_by_color_hex}
            textColor={entry.changed_by_text_color}
          />
          <Text variant="caption">{action}</Text>
          <Text variant="caption">· {formatDate(entry.created_at)}</Text>
        </Inline>
      </div>
    </div>
  );
}

function CommentEntry({
  comment,
  mentionColors,
}: {
  comment: TicketComment;
  mentionColors: MentionColorMap;
}) {
  return (
    <div className="timeline-row">
      <div className="timeline-node">
        <MaterialIcon name="chat_bubble" size={12} />
      </div>
      <div className="timeline-content">
        <div className="activity-comment">
          <div className="activity-comment__header">
            <Inline gap="xs" align="center">
              <UserPill
                name={comment.author_display_name}
                color={comment.author_color_hex}
                textColor={comment.author_text_color}
              />
              <Text variant="caption">commented</Text>
            </Inline>
            <Text variant="caption">{formatDate(comment.created_at)}</Text>
          </div>
          <div className="activity-comment__body">
            <MarkdownRenderer markdown={comment.body} mentionColors={mentionColors} />
          </div>
        </div>
      </div>
    </div>
  );
}
