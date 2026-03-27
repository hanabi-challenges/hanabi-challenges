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
} from '@mantine/core';
import type { TicketDetail, TicketComment, TicketVoteState } from '@tracker/types';
import { api, ApiError } from '../api.js';
import { TicketStatusBadge } from '../components/TicketStatusBadge.js';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [votes, setVotes] = useState<TicketVoteState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [votingInFlight, setVotingInFlight] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getTicket(id), api.listComments(id), api.getVotes(id)])
      .then(([t, c, v]) => {
        setTicket(t);
        setComments(c.comments);
        setVotes(v);
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

        <Text>{ticket.description}</Text>

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
      </Stack>
    </Container>
  );
}
