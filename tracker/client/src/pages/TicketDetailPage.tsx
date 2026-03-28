import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Title,
  Stack,
  Group,
  Text,
  Badge,
  Loader,
  Alert,
  Divider,
  Textarea,
  Button,
  Card,
  Box,
  Select,
  TextInput,
} from '@mantine/core';
import type {
  TicketDetail,
  TicketComment,
  TicketVoteState,
  TicketHistoryEntry,
  StatusSlug,
} from '@tracker/types';
import { api, ApiError } from '../api.js';
import { TicketStatusBadge } from '../components/TicketStatusBadge.js';

const TRIAGE_TRANSITIONS: { value: StatusSlug; label: string }[] = [
  { value: 'triaged', label: 'Triaged' },
  { value: 'in_review', label: 'In Review' },
  { value: 'decided', label: 'Decided' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'closed', label: 'Closed' },
];

function HistoryTimeline({ history }: { history: TicketHistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <Stack gap="xs">
      {history.map((entry) => (
        <Card key={entry.id} withBorder padding="xs" bg="gray.0">
          <Group gap="xs" align="flex-start">
            <Text size="xs" c="dimmed" style={{ minWidth: 140 }}>
              {new Date(entry.created_at).toLocaleString()}
            </Text>
            <Stack gap={2} style={{ flex: 1 }}>
              <Text size="sm">
                <Text span fw={600}>
                  {entry.changed_by_display_name}
                </Text>{' '}
                transitioned{' '}
                {entry.from_status_slug ? (
                  <>
                    <Badge size="xs" variant="outline">
                      {entry.from_status_slug.replace(/_/g, ' ')}
                    </Badge>
                    {' → '}
                  </>
                ) : null}
                <Badge size="xs" variant="light">
                  {entry.to_status_slug.replace(/_/g, ' ')}
                </Badge>
              </Text>
              {entry.resolution_note && (
                <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
                  {entry.resolution_note}
                </Text>
              )}
            </Stack>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [votes, setVotes] = useState<TicketVoteState | null>(null);
  const [history, setHistory] = useState<TicketHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [votingInFlight, setVotingInFlight] = useState(false);

  // Moderation panel state
  const [triageTo, setTriageTo] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [triaging, setTriaging] = useState(false);
  const [flagging, setFlagging] = useState(false);
  const [duplicateOf, setDuplicateOf] = useState('');
  const [closingDuplicate, setClosingDuplicate] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.getTicket(id),
      api.listComments(id),
      api.getVotes(id),
      api.getTicketHistory(id),
    ])
      .then(([t, c, v, h]) => {
        setTicket(t);
        setComments(c.comments);
        setVotes(v);
        setHistory(h.history);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to load ticket.');
      })
      .finally(() => setLoading(false));
  }, [id]);

  function handleAddComment() {
    if (!id || !commentBody.trim()) return;
    setSubmittingComment(true);
    api
      .addComment(id, { body: commentBody.trim() })
      .then(() => api.listComments(id))
      .then((c) => {
        setComments(c.comments);
        setCommentBody('');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to post comment.');
      })
      .finally(() => setSubmittingComment(false));
  }

  function handleVote() {
    if (!id || !votes || votingInFlight) return;
    setVotingInFlight(true);
    const action = votes.user_has_voted ? 'remove' : 'add';
    api
      .castVote(id, action)
      .then((v) => setVotes(v))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Failed to cast vote.');
      })
      .finally(() => setVotingInFlight(false));
  }

  function handleTriage() {
    if (!id || !triageTo) return;
    setTriaging(true);
    api
      .transitionTicket(id, {
        to_status: triageTo as StatusSlug,
        ...(resolutionNote ? { resolution_note: resolutionNote } : {}),
      })
      .then(() => Promise.all([api.getTicket(id), api.getTicketHistory(id)]))
      .then(([t, h]) => {
        setTicket(t);
        setHistory(h.history);
        setTriageTo(null);
        setResolutionNote('');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Transition failed.');
      })
      .finally(() => setTriaging(false));
  }

  function handleFlag() {
    if (!id || !ticket) return;
    setFlagging(true);
    const action = api.flagTicket(id);
    action
      .then(() => api.getTicket(id))
      .then((t) => setTicket(t))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Flag action failed.');
      })
      .finally(() => setFlagging(false));
  }

  function handleUnflag() {
    if (!id) return;
    setFlagging(true);
    api
      .unflagTicket(id)
      .then(() => api.getTicket(id))
      .then((t) => setTicket(t))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Unflag failed.');
      })
      .finally(() => setFlagging(false));
  }

  function handleCloseDuplicate() {
    if (!id || !duplicateOf.trim()) return;
    setClosingDuplicate(true);
    api
      .closeAsDuplicate(id, duplicateOf.trim())
      .then(() => Promise.all([api.getTicket(id), api.getTicketHistory(id)]))
      .then(([t, h]) => {
        setTicket(t);
        setHistory(h.history);
        setDuplicateOf('');
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Duplicate closure failed.');
      })
      .finally(() => setClosingDuplicate(false));
  }

  if (loading) return <Loader m="md" />;
  if (error)
    return (
      <Alert color="red" m="md">
        {error}
      </Alert>
    );
  if (!ticket) return null;

  return (
    <Container size="md" py="md">
      <Stack gap="lg">
        <Stack gap="xs">
          <Group justify="space-between" align="flex-start">
            <Title order={2}>{ticket.title}</Title>
            <TicketStatusBadge status={ticket.status_slug} />
          </Group>
          <Group gap="xs">
            <Badge variant="outline">{ticket.type_slug.replace(/_/g, ' ')}</Badge>
            <Badge variant="outline" color="teal">
              {ticket.domain_slug.replace(/_/g, ' ')}
            </Badge>
            {ticket.severity && (
              <Badge variant="outline" color="orange">
                {ticket.severity}
              </Badge>
            )}
            {ticket.reproducibility && (
              <Badge variant="outline" color="grape">
                {ticket.reproducibility}
              </Badge>
            )}
          </Group>
          <Group gap="xs">
            <Text size="sm" c="dimmed">
              Submitted by {ticket.submitted_by_display_name}
            </Text>
            <Text size="sm" c="dimmed">
              · {new Date(ticket.created_at).toLocaleDateString()}
            </Text>
          </Group>
        </Stack>

        <Text style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</Text>

        {votes && (
          <Group>
            <Button
              variant={votes.user_has_voted ? 'filled' : 'outline'}
              size="sm"
              onClick={handleVote}
              loading={votingInFlight}
            >
              {votes.user_has_voted ? '▲ Voted' : '▲ Vote'} ({votes.vote_count})
            </Button>
          </Group>
        )}

        {history.length > 0 && (
          <>
            <Divider label="Status history" labelPosition="left" />
            <HistoryTimeline history={history} />
          </>
        )}

        {/* Moderation panel — visible to moderators/committee */}
        <Divider label="Moderation" labelPosition="left" />
        <Card withBorder padding="sm">
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Transition status
            </Text>
            <Group align="flex-end" gap="sm">
              <Select
                placeholder="Select target status"
                data={TRIAGE_TRANSITIONS}
                value={triageTo}
                onChange={setTriageTo}
                style={{ flex: 1 }}
              />
              <TextInput
                placeholder="Resolution note (optional)"
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.currentTarget.value)}
                style={{ flex: 2 }}
              />
              <Button onClick={handleTriage} loading={triaging} disabled={!triageTo} size="sm">
                Transition
              </Button>
            </Group>
            <Group gap="sm">
              <Button variant="outline" size="sm" onClick={handleFlag} loading={flagging}>
                Flag for review
              </Button>
              <Button
                variant="subtle"
                size="sm"
                color="gray"
                onClick={handleUnflag}
                loading={flagging}
              >
                Unflag
              </Button>
            </Group>
            <Group align="flex-end" gap="sm">
              <TextInput
                placeholder="Canonical ticket ID"
                value={duplicateOf}
                onChange={(e) => setDuplicateOf(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                color="red"
                variant="outline"
                size="sm"
                onClick={handleCloseDuplicate}
                loading={closingDuplicate}
                disabled={!duplicateOf.trim()}
              >
                Close as duplicate
              </Button>
            </Group>
          </Stack>
        </Card>

        <Divider label="Comments" labelPosition="left" />

        <Stack gap="sm">
          {comments.length === 0 && (
            <Text c="dimmed" size="sm">
              No comments yet.
            </Text>
          )}
          {comments.map((comment) => (
            <Card key={comment.id} withBorder padding="sm">
              <Group justify="space-between" mb="xs">
                <Text fw={600} size="sm">
                  {comment.author_display_name}
                </Text>
                <Group gap="xs">
                  {comment.is_internal && (
                    <Badge size="xs" color="gray">
                      internal
                    </Badge>
                  )}
                  <Text size="xs" c="dimmed">
                    {new Date(comment.created_at).toLocaleString()}
                  </Text>
                </Group>
              </Group>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {comment.body}
              </Text>
            </Card>
          ))}
        </Stack>

        {!ticket.is_terminal && (
          <Box>
            <Textarea
              label="Add a comment"
              placeholder="Write your comment..."
              value={commentBody}
              onChange={(e) => setCommentBody(e.currentTarget.value)}
              minRows={3}
              mb="xs"
            />
            <Button
              onClick={handleAddComment}
              loading={submittingComment}
              disabled={!commentBody.trim()}
            >
              Post comment
            </Button>
          </Box>
        )}
      </Stack>
    </Container>
  );
}
