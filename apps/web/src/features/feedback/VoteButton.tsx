import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button, Inline, MaterialIcon, Text } from '../../design-system';
import { castVote, removeVote } from './api';
import type { TicketVoteState } from './types';

type VoteButtonProps = {
  voteState: TicketVoteState;
  token: string | null;
  onVoteChange: (next: TicketVoteState) => void;
};

export function VoteButton({ voteState, token, onVoteChange }: VoteButtonProps): ReactElement {
  const [busy, setBusy] = useState(false);

  const handleClick = async () => {
    if (!token || busy) return;
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
    <Inline gap="sm" align="center">
      <Button
        variant={voteState.user_has_voted ? 'primary' : 'secondary'}
        size="sm"
        onClick={() => void handleClick()}
        disabled={!token || busy}
        aria-label={voteState.user_has_voted ? 'Remove upvote' : 'Upvote'}
      >
        <Inline gap="xs" align="center">
          <MaterialIcon name="arrow_upward" size={14} />
          Upvote
        </Inline>
      </Button>
      <Text variant="muted">{voteState.vote_count}</Text>
    </Inline>
  );
}
