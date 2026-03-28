import { useEffect, useState } from 'react';
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
  PageContainer,
  Pill,
  Section,
  SectionCard,
  Select,
  Stack,
  Text,
} from '../design-system';
import { useAuth } from '../context/AuthContext';
import { VoteButton } from '../features/feedback/VoteButton';
import {
  getTicket,
  getTicketHistory,
  getTicketComments,
  getVoteState,
  createComment,
  transitionStatus,
} from '../features/feedback/api';
import {
  STATUS_CONFIG,
  TYPE_LABELS,
  DOMAIN_LABELS,
  SEVERITY_LABELS,
  REPRODUCIBILITY_LABELS,
  VALID_NEXT_STATUSES,
} from '../features/feedback/statusConfig';
import type {
  TicketDetail,
  TicketHistoryEntry,
  TicketComment,
  TicketVoteState,
  StatusSlug,
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
  const { user, token } = useAuth();

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [voteState, setVoteState] = useState<TicketVoteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [transitionTo, setTransitionTo] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPERADMIN';

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      getTicket(id),
      getTicketHistory(id),
      getTicketComments(id),
      getVoteState(id, token),
    ])
      .then(([t, { history }, { comments }, votes]) => {
        setTicket(t);
        setTimeline(buildTimeline(history, comments));
        setVoteState(votes);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load ticket.');
      })
      .finally(() => setLoading(false));
  }, [id, token]);

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

  const applyTransition = async () => {
    if (!id || !token || !transitionTo) return;
    setTransitionBusy(true);
    setTransitionError(null);
    try {
      const updated = await transitionStatus(
        id,
        {
          to_status: transitionTo as StatusSlug,
          resolution_note: resolutionNote.trim() || undefined,
        },
        token,
      );
      setTicket((prev) => (prev ? { ...prev, status_slug: updated.status_slug } : prev));
      const [{ history }, { comments }] = await Promise.all([
        getTicketHistory(id),
        getTicketComments(id),
      ]);
      setTimeline(buildTimeline(history, comments));
      setTransitionTo('');
      setResolutionNote('');
    } catch (err) {
      setTransitionError(err instanceof Error ? err.message : 'Failed to transition status.');
    } finally {
      setTransitionBusy(false);
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

  const nextStatusOptions = (VALID_NEXT_STATUSES[ticket.status_slug] ?? []).map((s) => ({
    value: s,
    label: STATUS_CONFIG[s]?.label ?? s,
  }));

  return (
    <Main>
      <PageContainer>
        <Section paddingY="lg" baseLevel={1}>
          {/* Back link */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/feedback')}
            style={{ marginBottom: 'var(--ds-space-xs)' }}
          >
            <Inline gap="xs" align="center">
              <MaterialIcon name="arrow_back" size={14} />
              Back
            </Inline>
          </Button>

          <div className="feedback-detail__layout">
            {/* Main column */}
            <Stack gap="md">
              {/* Title + status */}
              <Inline justify="space-between" align="start" wrap gap="sm">
                <Heading level={1} style={{ flex: 1, minWidth: 0 }}>
                  {ticket.title}
                </Heading>
                <Badge tone={statusTone}>{statusLabel}</Badge>
              </Inline>

              {/* Description */}
              <SectionCard>
                <Text variant="body" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {ticket.description}
                </Text>
              </SectionCard>

              {/* Timeline */}
              {timeline.length > 0 ? (
                <Section header={<Heading level={2}>History</Heading>} paddingY="sm">
                  <div className="feedback-detail__timeline">
                    {timeline.map((entry) =>
                      entry.kind === 'history' ? (
                        <HistoryEntry key={entry.data.id} entry={entry.data} />
                      ) : (
                        <CommentEntry key={entry.data.id} comment={entry.data} />
                      ),
                    )}
                  </div>
                </Section>
              ) : null}

              {/* Add comment */}
              {token ? (
                <Section header={<Heading level={2}>Add a comment</Heading>} paddingY="sm">
                  <Stack gap="sm">
                    <Input
                      multiline
                      rows={4}
                      placeholder="Write a comment…"
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      fullWidth
                    />
                    {commentError ? <Alert variant="error" message={commentError} /> : null}
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => void submitComment()}
                      disabled={commentBusy || !commentBody.trim()}
                    >
                      {commentBusy ? 'Posting…' : 'Post comment'}
                    </Button>
                  </Stack>
                </Section>
              ) : (
                <Text variant="caption">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>
                    Log in
                  </Button>{' '}
                  to leave a comment.
                </Text>
              )}
            </Stack>

            {/* Sidebar */}
            <Stack gap="sm">
              {/* Metadata */}
              <SectionCard>
                <Stack gap="sm">
                  <Heading level={3}>Details</Heading>
                  <MetaRow label="Type">
                    <Pill size="sm" variant="default">
                      {TYPE_LABELS[ticket.type_slug] ?? ticket.type_slug}
                    </Pill>
                  </MetaRow>
                  <MetaRow label="Domain">
                    <Pill size="sm" variant="default">
                      {DOMAIN_LABELS[ticket.domain_slug] ?? ticket.domain_slug}
                    </Pill>
                  </MetaRow>
                  {ticket.severity ? (
                    <MetaRow label="Severity">
                      <Text variant="body">
                        {SEVERITY_LABELS[ticket.severity] ?? ticket.severity}
                      </Text>
                    </MetaRow>
                  ) : null}
                  {ticket.reproducibility ? (
                    <MetaRow label="Reproducibility">
                      <Text variant="body">
                        {REPRODUCIBILITY_LABELS[ticket.reproducibility] ?? ticket.reproducibility}
                      </Text>
                    </MetaRow>
                  ) : null}
                  <MetaRow label="Submitted by">
                    <Text variant="body">{ticket.submitted_by_display_name}</Text>
                  </MetaRow>
                  <MetaRow label="Opened">
                    <Text variant="caption">{formatDate(ticket.created_at)}</Text>
                  </MetaRow>
                  {ticket.updated_at !== ticket.created_at ? (
                    <MetaRow label="Updated">
                      <Text variant="caption">{formatDate(ticket.updated_at)}</Text>
                    </MetaRow>
                  ) : null}
                </Stack>
              </SectionCard>

              {/* Vote */}
              {voteState ? (
                <SectionCard>
                  <Stack gap="sm">
                    <Heading level={3}>Votes</Heading>
                    <VoteButton voteState={voteState} token={token} onVoteChange={setVoteState} />
                    {!token ? <Text variant="caption">Log in to vote.</Text> : null}
                  </Stack>
                </SectionCard>
              ) : null}

              {/* Admin tools */}
              {isAdmin && nextStatusOptions.length > 0 ? (
                <SectionCard>
                  <Stack gap="sm">
                    <Heading level={3}>Moderation</Heading>
                    <Select
                      options={nextStatusOptions}
                      value={transitionTo}
                      onChange={setTransitionTo}
                      placeholder="Transition to…"
                    />
                    <Input
                      multiline
                      rows={2}
                      placeholder="Resolution note (optional)"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      fullWidth
                    />
                    {transitionError ? <Alert variant="error" message={transitionError} /> : null}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => void applyTransition()}
                      disabled={transitionBusy || !transitionTo}
                    >
                      {transitionBusy ? 'Applying…' : 'Apply'}
                    </Button>
                  </Stack>
                </SectionCard>
              ) : null}
            </Stack>
          </div>
        </Section>
      </PageContainer>
    </Main>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Inline justify="space-between" align="baseline" gap="xs" wrap>
      <Text variant="caption">{label}</Text>
      {children}
    </Inline>
  );
}

function HistoryEntry({ entry }: { entry: TicketHistoryEntry }) {
  const toMeta = STATUS_CONFIG[entry.to_status_slug];
  return (
    <div className="feedback-detail__timeline-entry">
      <div className="feedback-detail__timeline-dot feedback-detail__timeline-dot--transition">
        <MaterialIcon name="swap_horiz" size={14} />
      </div>
      <div className="feedback-detail__timeline-body">
        <div className="feedback-detail__meta-row">
          <Text variant="label">
            {entry.from_status_slug
              ? `${STATUS_CONFIG[entry.from_status_slug]?.label ?? entry.from_status_slug} → ${toMeta?.label ?? entry.to_status_slug}`
              : `Opened as ${toMeta?.label ?? entry.to_status_slug}`}
          </Text>
          <Text variant="caption">{formatDate(entry.created_at)}</Text>
        </div>
        <Text variant="caption">by {entry.changed_by_display_name}</Text>
        {entry.resolution_note ? (
          <Text variant="muted" style={{ marginTop: 4 }}>
            {entry.resolution_note}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

function CommentEntry({ comment }: { comment: TicketComment }) {
  const initial = comment.author_display_name.charAt(0).toUpperCase();
  return (
    <div className="feedback-detail__timeline-entry">
      <div className="feedback-detail__timeline-dot">{initial}</div>
      <div className="feedback-detail__timeline-body">
        <div className="feedback-detail__meta-row">
          <Text variant="label">{comment.author_display_name}</Text>
          <Text variant="caption">{formatDate(comment.created_at)}</Text>
        </div>
        <p className="feedback-detail__comment-text">{comment.body}</p>
      </div>
    </div>
  );
}
