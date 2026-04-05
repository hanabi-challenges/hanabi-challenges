-- Up Migration

-- Records GitHub Issues created from tracker tickets.
-- One row per ticket (a ticket may only generate one GitHub issue).
CREATE TABLE github_links (
  ticket_id   UUID    NOT NULL PRIMARY KEY REFERENCES tickets (id),
  issue_number INTEGER NOT NULL,
  issue_url    TEXT    NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stores every inbound GitHub webhook payload before processing.
-- The HTTP handler writes pending rows immediately and returns 200;
-- the background processor updates status after handling.
CREATE TABLE inbound_webhook_log (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  github_event TEXT        NOT NULL,
  payload      JSONB       NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'processed', 'ignored', 'failed')),
  error        TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX idx_inbound_webhook_pending ON inbound_webhook_log (status)
  WHERE status = 'pending';

-- Down Migration

DROP INDEX idx_inbound_webhook_pending;
DROP TABLE inbound_webhook_log;
DROP TABLE github_links;
