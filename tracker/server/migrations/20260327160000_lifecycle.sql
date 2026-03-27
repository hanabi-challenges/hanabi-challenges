-- Up Migration

-- Records every status transition on a ticket.
-- The lifecycle engine is the only writer; no route handler or service
-- may insert into this table directly (architecture invariant).
CREATE TABLE ticket_status_history (
  id             UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID        NOT NULL REFERENCES tickets (id),
  -- from_status_id is NULL for the initial 'submitted' transition.
  from_status_id SMALLINT    REFERENCES statuses (id),
  to_status_id   SMALLINT    NOT NULL REFERENCES statuses (id),
  changed_by     UUID        NOT NULL REFERENCES users (id),
  -- Optional note attached by committee on a 'decided' transition.
  resolution_note TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_status_history_ticket_id ON ticket_status_history (ticket_id, created_at DESC);

-- Down Migration

DROP INDEX idx_status_history_ticket_id;
DROP TABLE ticket_status_history;
