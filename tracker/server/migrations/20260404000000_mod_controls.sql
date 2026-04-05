-- Soft delete support for tickets
ALTER TABLE tickets ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_tickets_deleted_at
  ON tickets (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Metadata change history (one row per save, changes stored as JSONB)
-- changes shape: { field: { from: string | null, to: string | null } }
-- e.g. { "type": { "from": "bug", "to": "feature_request" }, "severity": { "from": "cosmetic", "to": null } }
CREATE TABLE ticket_metadata_history (
  id          UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID        NOT NULL REFERENCES tickets (id) ON DELETE CASCADE,
  changed_by  INTEGER     NOT NULL REFERENCES public.users (id),
  changes     JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_metadata_history_ticket_id
  ON ticket_metadata_history (ticket_id, created_at DESC);
