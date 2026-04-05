-- Add token_version to users for immediate session invalidation when roles change.
-- When the bot or admin updates a user's roles, token_version is incremented.
-- Every authenticated request checks the JWT's token_version against the DB;
-- a mismatch means the session was invalidated and the user must log in again.
ALTER TABLE users
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1;
