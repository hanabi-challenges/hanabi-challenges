-- Up Migration

CREATE TABLE ticket_comments (
  id          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES tickets (id),
  author_id   UUID        NOT NULL REFERENCES users (id),
  body        TEXT        NOT NULL,
  -- Internal notes visible only to moderator and committee.
  is_internal BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_ticket_id ON ticket_comments (ticket_id, created_at ASC);

-- One upvote per user per ticket. No downvotes.
CREATE TABLE ticket_votes (
  ticket_id  UUID        NOT NULL REFERENCES tickets (id),
  user_id    UUID        NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

-- Down Migration

DROP TABLE ticket_votes;
DROP INDEX idx_comments_ticket_id;
DROP TABLE ticket_comments;
