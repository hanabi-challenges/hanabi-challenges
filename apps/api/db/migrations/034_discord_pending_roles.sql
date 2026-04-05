-- Stores role grants for Discord members who don't yet have a linked site account.
-- When a user links their Discord account, any pending roles are applied immediately
-- and this row is deleted.
CREATE TABLE discord_pending_roles (
  discord_id TEXT PRIMARY KEY,
  roles      TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
