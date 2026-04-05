-- Up Migration

-- Per-user ticket pins. Pinned tickets float to the top of the user's feed.
CREATE TABLE ticket_pins (
  ticket_id  UUID        NOT NULL REFERENCES tickets (id),
  user_id    UUID        NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

CREATE INDEX idx_ticket_pins_user_id ON ticket_pins (user_id, created_at DESC);

-- Down Migration

DROP INDEX idx_ticket_pins_user_id;
DROP TABLE ticket_pins;
