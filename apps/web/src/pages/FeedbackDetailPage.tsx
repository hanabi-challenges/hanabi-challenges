import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  Heading,
  Inline,
  Input,
  Main,
  MaterialIcon,
  Modal,
  PageContainer,
  PageHeader,
  Section,
  Select,
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
  updateTicketMetadata,
  deleteTicket,
  transitionStatus,
} from '../features/feedback/api';
import {
  STATUS_CONFIG,
  TYPE_LABELS,
  DOMAIN_LABELS,
  SEVERITY_LABELS,
  REPRODUCIBILITY_LABELS,
  getValidNextStatuses,
} from '../features/feedback/statusConfig';
import type {
  TicketDetail,
  TicketHistoryEntry,
  StatusHistoryEntry,
  MetadataHistoryEntry,
  TicketComment,
  TicketVoteState,
  TicketPinState,
  TicketSubscriptionState,
  StatusSlug,
  BugSeverity,
  BugReproducibility,
  TicketTypeSlug,
  DomainSlug,
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

const TERMINAL_STATUSES = new Set<StatusSlug>(['resolved', 'rejected', 'closed']);

export function FeedbackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [voteState, setVoteState] = useState<TicketVoteState | null>(null);
  const [pinState, setPinState] = useState<TicketPinState | null>(null);
  const [subscriptionState, setSubscriptionState] = useState<TicketSubscriptionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [pinBusy, setPinBusy] = useState(false);
  const [subscribeBusy, setSubscribeBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Status transition state
  const [transitionTo, setTransitionTo] = useState<StatusSlug | ''>('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Metadata edit state — initialised from ticket on load
  const [metaTypeSlug, setMetaTypeSlug] = useState<TicketTypeSlug | ''>('');
  const [metaDomainSlug, setMetaDomainSlug] = useState<DomainSlug | ''>('');
  const [metaSeverity, setMetaSeverity] = useState<BugSeverity | 'none' | ''>('');
  const [metaReproducibility, setMetaReproducibility] = useState<BugReproducibility | 'none' | ''>(
    '',
  );
  const [metaBusy, setMetaBusy] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);

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
        setMetaTypeSlug(t.type_slug);
        setMetaDomainSlug(t.domain_slug);
        setMetaSeverity(t.severity ?? 'none');
        setMetaReproducibility(t.reproducibility ?? 'none');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load ticket.');
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  const isMod =
    user !== null &&
    (user.roles.includes('SUPERADMIN') ||
      user.roles.includes('SITE_ADMIN') ||
      user.roles.includes('MOD'));

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

  const submitTransition = async () => {
    if (!id || !token || !transitionTo || !ticket) return;
    setTransitionBusy(true);
    setTransitionError(null);
    try {
      await transitionStatus(
        id,
        { to_status: transitionTo, resolution_note: resolutionNote.trim() || undefined },
        token,
      );
      const [t, { history }, { comments }] = await Promise.all([
        getTicket(id),
        getTicketHistory(id),
        getTicketComments(id),
      ]);
      setTicket(t);
      setTimeline(buildTimeline(history, comments));
      setTransitionTo('');
      setResolutionNote('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Failed to transition status.');
    } finally {
      setTransitionBusy(false);
    }
  };

  const submitMetadata = async () => {
    if (!id || !token || !ticket) return;
    setMetaBusy(true);
    setMetaError(null);
    try {
      const updated = await updateTicketMetadata(
        id,
        {
          type_slug: metaTypeSlug as TicketTypeSlug,
          domain_slug: metaDomainSlug as DomainSlug,
          severity: metaSeverity === 'none' ? null : (metaSeverity as BugSeverity) || undefined,
          reproducibility:
            metaReproducibility === 'none'
              ? null
              : (metaReproducibility as BugReproducibility) || undefined,
        },
        token,
      );
      setTicket(updated);
      const { history } = await getTicketHistory(id);
      setTimeline((prev) => {
        const comments = prev
          .filter((e) => e.kind === 'comment')
          .map((e) => e.data as TicketComment);
        return buildTimeline(history, comments);
      });
    } catch (err) {
      setMetaError(err instanceof Error ? err.message : 'Failed to update metadata.');
    } finally {
      setMetaBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!id || !token) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteTicket(id, token);
      navigate('/feedback');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete ticket.');
      setDeleteBusy(false);
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

  const validNextStatuses = user ? getValidNextStatuses(ticket.status_slug, user.roles) : [];

  const needsResolutionNote = transitionTo ? TERMINAL_STATUSES.has(transitionTo) : false;

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" baseLevel={1}>
          <Stack gap="sm">
            <div
              className={`feedback-detail__layout${isMod ? ' feedback-detail__layout--mod' : ''}`}
            >
              {/* Content column */}
              <div className="feedback-detail__content">
                <Stack gap="md">
                  {/* Title + status badge */}
                  <PageHeader
                    title={ticket.title}
                    actions={<Badge tone={statusTone}>{statusLabel}</Badge>}
                  />

                  {/* Description */}
                  <MarkdownRenderer markdown={ticket.description} mentionColors={mentionColors} />

                  {/* Metadata badges */}
                  <Inline gap="xs" align="center" wrap>
                    <Badge size="sm">{TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}</Badge>
                    <Badge size="sm">
                      {DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}
                    </Badge>
                    {ticket.severity ? (
                      <Badge size="sm">{SEVERITY_LABELS[ticket.severity] ?? ticket.severity}</Badge>
                    ) : null}
                    {ticket.reproducibility ? (
                      <Badge size="sm">
                        {REPRODUCIBILITY_LABELS[ticket.reproducibility] ?? ticket.reproducibility}
                      </Badge>
                    ) : null}
                  </Inline>

                  {/* Activity timeline */}
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

              {/* Actions column — left mini-rail */}
              <div className="feedback-detail__actions">
                <Stack gap="md" align="center">
                  {voteState ? (
                    <VoteButton
                      voteState={voteState}
                      token={token}
                      onVoteChange={setVoteState}
                      onLoginRequired={() => setLoginModalOpen(true)}
                    />
                  ) : null}

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

              {/* Mod sidebar — right rail, mods only */}
              {isMod ? (
                <div className="feedback-detail__mod">
                  <Stack gap="lg">
                    {/* Status transition */}
                    <Stack gap="sm">
                      <Heading level={5}>Change status</Heading>
                      <Select
                        options={validNextStatuses.map((s) => ({
                          value: s,
                          label: STATUS_CONFIG[s]?.label ?? s,
                        }))}
                        value={transitionTo}
                        onChange={(v) => {
                          setTransitionTo(v as StatusSlug);
                          setResolutionNote('');
                          setTransitionError(null);
                        }}
                        placeholder="Select next status…"
                        disabled={transitionBusy || validNextStatuses.length === 0}
                      />
                      {needsResolutionNote ? (
                        <Input
                          multiline
                          rows={3}
                          value={resolutionNote}
                          onChange={(e) => setResolutionNote(e.target.value)}
                          placeholder="Resolution note (optional)"
                          disabled={transitionBusy}
                        />
                      ) : null}
                      {transitionError ? <Alert variant="error" message={transitionError} /> : null}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => void submitTransition()}
                        disabled={transitionBusy || !transitionTo}
                      >
                        {transitionBusy ? 'Applying…' : 'Apply'}
                      </Button>
                    </Stack>

                    {/* Metadata edit */}
                    <Stack gap="sm">
                      <Heading level={5}>Edit metadata</Heading>
                      <Select
                        options={Object.entries(TYPE_LABELS).map(([v, l]) => ({
                          value: v,
                          label: l,
                        }))}
                        value={metaTypeSlug}
                        onChange={(v) => setMetaTypeSlug(v as TicketTypeSlug)}
                        placeholder="Type…"
                        disabled={metaBusy}
                      />
                      <Select
                        options={Object.entries(DOMAIN_LABELS).map(([v, l]) => ({
                          value: v,
                          label: l,
                        }))}
                        value={metaDomainSlug}
                        onChange={(v) => setMetaDomainSlug(v as DomainSlug)}
                        placeholder="Domain…"
                        disabled={metaBusy}
                      />
                      <Select
                        options={[
                          { value: 'none', label: 'None' },
                          ...Object.entries(SEVERITY_LABELS).map(([v, l]) => ({
                            value: v,
                            label: l,
                          })),
                        ]}
                        value={metaSeverity}
                        onChange={(v) => setMetaSeverity(v as BugSeverity | 'none')}
                        placeholder="Severity…"
                        disabled={metaBusy}
                      />
                      <Select
                        options={[
                          { value: 'none', label: 'None' },
                          ...Object.entries(REPRODUCIBILITY_LABELS).map(([v, l]) => ({
                            value: v,
                            label: l,
                          })),
                        ]}
                        value={metaReproducibility}
                        onChange={(v) => setMetaReproducibility(v as BugReproducibility | 'none')}
                        placeholder="Reproducibility…"
                        disabled={metaBusy}
                      />
                      {metaError ? <Alert variant="error" message={metaError} /> : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void submitMetadata()}
                        disabled={metaBusy}
                      >
                        {metaBusy ? 'Saving…' : 'Save metadata'}
                      </Button>
                    </Stack>

                    {/* Delete */}
                    <Stack gap="sm">
                      <Heading level={5}>Danger zone</Heading>
                      <Button
                        variant="outline"
                        size="sm"
                        className="feedback-detail__danger-btn"
                        onClick={() => setDeleteModalOpen(true)}
                      >
                        Delete ticket
                      </Button>
                    </Stack>
                  </Stack>
                </div>
              ) : null}

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

              {/* Delete confirmation modal */}
              <Modal
                open={deleteModalOpen}
                onClose={() => {
                  setDeleteModalOpen(false);
                  setDeleteError(null);
                }}
                maxWidth="400px"
              >
                <Heading level={3}>Delete ticket?</Heading>
                <Text variant="body">
                  This will permanently remove the ticket from the list. This action cannot be
                  undone.
                </Text>
                {deleteError ? <Alert variant="error" message={deleteError} /> : null}
                <Inline gap="sm">
                  <Button
                    variant="outline"
                    className="feedback-detail__danger-btn"
                    onClick={() => void confirmDelete()}
                    disabled={deleteBusy}
                  >
                    {deleteBusy ? 'Deleting…' : 'Yes, delete'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setDeleteModalOpen(false);
                      setDeleteError(null);
                    }}
                    disabled={deleteBusy}
                  >
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
  if (entry.kind === 'metadata') {
    return <MetadataHistoryEntryRow entry={entry} />;
  }
  return <StatusHistoryEntryRow entry={entry} />;
}

function StatusHistoryEntryRow({ entry }: { entry: StatusHistoryEntry }) {
  const toLabel = STATUS_CONFIG[entry.to_status_slug]?.label ?? entry.to_status_slug;
  const action = entry.from_status_slug ? `changed the status to ${toLabel}` : `opened the ticket`;
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
        {entry.resolution_note ? (
          <Text variant="caption" style={{ marginTop: 4 }}>
            {entry.resolution_note}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

function MetadataHistoryEntryRow({ entry }: { entry: MetadataHistoryEntry }) {
  const fieldLabels: Record<string, string> = {
    type: 'type',
    domain: 'domain',
    severity: 'severity',
    reproducibility: 'reproducibility',
  };
  const changeDescriptions = Object.entries(entry.changes).map(([field, change]) => {
    const label = fieldLabels[field] ?? field;
    const from = change.from ?? 'none';
    const to = change.to ?? 'none';
    return `${label}: ${from} → ${to}`;
  });

  return (
    <div className="timeline-row">
      <div className="timeline-node">
        <MaterialIcon name="edit_note" size={12} />
      </div>
      <div className="timeline-content">
        <Inline gap="xs" align="center">
          <UserPill
            name={entry.changed_by_display_name}
            color={entry.changed_by_color_hex}
            textColor={entry.changed_by_text_color}
          />
          <Text variant="caption">updated metadata</Text>
          <Text variant="caption">· {formatDate(entry.created_at)}</Text>
        </Inline>
        {changeDescriptions.length > 0 ? (
          <Text variant="caption" style={{ marginTop: 4 }}>
            {changeDescriptions.join(', ')}
          </Text>
        ) : null}
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
