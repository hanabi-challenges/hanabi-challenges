-- Up Migration

-- Tracks which users are subscribed to a ticket.
-- Users are auto-subscribed by the service layer on ticket creation,
-- comment, and vote. Explicit subscribe/unsubscribe is also supported.
CREATE TABLE ticket_subscriptions (
  ticket_id  UUID        NOT NULL REFERENCES tickets (id),
  user_id    UUID        NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

-- One row per event that triggers notification fanout.
-- Inserted by the lifecycle engine and the discussion service.
CREATE TABLE notification_events (
  id         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID        NOT NULL REFERENCES tickets (id),
  -- Discriminator: 'status_changed', 'comment_added'
  event_type TEXT        NOT NULL,
  actor_id   UUID        NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_events_ticket_id
  ON notification_events (ticket_id, created_at DESC);

-- One row per subscriber per event. The actor is excluded from fanout.
CREATE TABLE user_notifications (
  id         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users (id),
  event_id   UUID        NOT NULL REFERENCES notification_events (id),
  is_read    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_id)
);

CREATE INDEX idx_user_notifications_user_id
  ON user_notifications (user_id, is_read, created_at DESC);

-- Down Migration

DROP INDEX idx_user_notifications_user_id;
DROP TABLE user_notifications;
DROP INDEX idx_notification_events_ticket_id;
DROP TABLE notification_events;
DROP TABLE ticket_subscriptions;
