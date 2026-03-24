-- Shadow users: users created by the replay ingestor before the player has
-- registered themselves.  password_hash is NULL until the player claims their
-- account via the normal token-based registration flow.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
