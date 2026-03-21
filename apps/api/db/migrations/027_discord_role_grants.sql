-- Discord role → admin grant infrastructure.
--
-- Users can link their Discord account; the system can then inspect their
-- guild roles and grant/revoke ADMIN access automatically.
--
-- discord_role_grants maps (Discord guild_id, Discord role_id) → app role.
-- Only 'ADMIN' is supported as a granted role (SUPERADMIN must be set manually).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS discord_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id
  ON users (discord_id)
  WHERE discord_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS discord_role_grants (
  id          SERIAL      NOT NULL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  role_id     TEXT        NOT NULL,
  app_role    TEXT        NOT NULL DEFAULT 'ADMIN'
                CHECK (app_role IN ('ADMIN')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, role_id)
);
