import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button, MaterialIcon, Stack, Text } from '../../design-system';
import { castVote, removeVote } from './api';
import type { TicketVoteState } from './types';

type VoteButtonProps = {
  voteState: TicketVoteState;
  token: string | null;
  onVoteChange: (next: TicketVoteState) => void;
  onLoginRequired: () => void;
};

export function VoteButton({
  voteState,
  token,
  onVoteChange,
  onLoginRequired,
}: VoteButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!token) {
      onLoginRequired();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const next = voteState.user_has_voted
        ? await removeVote(voteState.ticket_id, token)
        : await castVote(voteState.ticket_id, token);
      onVoteChange(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="xs" align="center">
      <Button
        variant="ghost"
        size="sm"
        icon
        onClick={() => void handleClick()}
        disabled={busy}
        aria-label={voteState.user_has_voted ? 'Remove vote' : 'Upvote'}
      >
        <MaterialIcon
          name="arrow_shape_up"
          size={20}
          style={
            voteState.user_has_voted
              ? { color: 'var(--ds-color-accent-strong)', fontVariationSettings: "'FILL' 1" }
              : undefined
          }
        />
      </Button>
      <Text variant="body" weight="bold">
        {voteState.vote_count}
      </Text>
    </Stack>
  );
}
