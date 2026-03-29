-- Up Migration

CREATE TABLE tickets (
  id                UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT        NOT NULL,
  type_id           SMALLINT    NOT NULL REFERENCES ticket_types (id),
  domain_id         SMALLINT    NOT NULL REFERENCES domains (id),
  submitted_by      UUID        NOT NULL REFERENCES users (id),
  current_status_id SMALLINT    NOT NULL REFERENCES statuses (id),
  -- Optional fields for bug-type tickets
  severity          TEXT        CHECK (severity IN ('cosmetic', 'functional', 'blocking')),
  reproducibility   TEXT        CHECK (reproducibility IN ('always', 'sometimes', 'once')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_submitted_by      ON tickets (submitted_by);
CREATE INDEX idx_tickets_current_status_id ON tickets (current_status_id);
CREATE INDEX idx_tickets_type_id           ON tickets (type_id);
CREATE INDEX idx_tickets_domain_id         ON tickets (domain_id);
CREATE INDEX idx_tickets_created_at        ON tickets (created_at DESC);

-- Down Migration

DROP INDEX idx_tickets_created_at;
DROP INDEX idx_tickets_domain_id;
DROP INDEX idx_tickets_type_id;
DROP INDEX idx_tickets_current_status_id;
DROP INDEX idx_tickets_submitted_by;
DROP TABLE tickets;
