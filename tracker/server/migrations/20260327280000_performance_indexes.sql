-- Up Migration

-- Partial index for tickets flagged ready for committee review.
-- listReadyForReviewTickets filters on ready_for_review_at IS NOT NULL;
-- without this index, that query would seq-scan the full tickets table.
CREATE INDEX idx_tickets_ready_for_review ON tickets (ready_for_review_at)
  WHERE ready_for_review_at IS NOT NULL;

-- Composite index supporting vote-count aggregation per ticket.
-- getPlanningSignal does LEFT JOIN ticket_votes ON ticket_id; the PK
-- (ticket_id, user_id) already covers this, but a covering index on
-- ticket_id alone is faster for COUNT aggregation.
CREATE INDEX idx_votes_ticket_id ON ticket_votes (ticket_id);

-- Down Migration

DROP INDEX idx_votes_ticket_id;
DROP INDEX idx_tickets_ready_for_review;
