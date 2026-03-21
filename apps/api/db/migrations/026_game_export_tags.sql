-- Add tags column to hanabi_live_game_exports.
-- Tags come from hanab.live's game_tags table and are returned in seed-list API
-- responses as a comma-separated string. They are stored here as a text array
-- so the application can filter and match by tag pattern without re-fetching.

ALTER TABLE hanabi_live_game_exports
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

-- Index for tag-pattern queries (e.g. 'convention:h-group' = ANY(tags)).
CREATE INDEX IF NOT EXISTS idx_hanabi_live_game_exports_tags
  ON hanabi_live_game_exports USING GIN (tags);
