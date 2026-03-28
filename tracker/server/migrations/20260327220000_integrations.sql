-- Up Migration

-- Links a tracker user to their Discord identity.
-- Created by the /token bot command; one Discord account per tracker user.
CREATE TABLE discord_identities (
  user_id          UUID        NOT NULL UNIQUE REFERENCES users (id),
  discord_user_id  TEXT        NOT NULL UNIQUE,
  discord_username TEXT        NOT NULL,
  linked_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Records every Discord outbound webhook attempt.
-- Delivery failures are logged here and do not affect ticket state.
-- event_id is nullable for webhook calls not tied to a specific event.
CREATE TABLE discord_delivery_log (
  id           UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID        REFERENCES notification_events (id),
  status       TEXT        NOT NULL CHECK (status IN ('success', 'failure')),
  http_status  INTEGER,
  error        TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_delivery_log_event_id ON discord_delivery_log (event_id);

-- Written by the Discord bot when a role is granted or revoked in the guild.
-- On successful /token, pending unprocessed rows for that Discord user are
-- applied as tracker role grants, then marked applied = TRUE.
CREATE TABLE discord_role_sync_log (
  id                UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_user_id   TEXT        NOT NULL,
  discord_role_name TEXT        NOT NULL,
  event_type        TEXT        NOT NULL CHECK (event_type IN ('granted', 'revoked')),
  applied           BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_role_sync_log_pending
  ON discord_role_sync_log (discord_user_id, applied)
  WHERE applied = FALSE;

-- Down Migration

DROP INDEX idx_role_sync_log_pending;
DROP TABLE discord_role_sync_log;
DROP INDEX idx_delivery_log_event_id;
DROP TABLE discord_delivery_log;
DROP TABLE discord_identities;
