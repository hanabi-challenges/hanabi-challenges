-- ELO ratings: scope to group_id when stage belongs to a group,
-- stage_id otherwise. This allows ELO to propagate across stages
-- within a group while still working for ungrouped individual stages.

-- 1. Drop old primary key first (stage_id cannot be made nullable while it is part of a PK)
ALTER TABLE event_player_ratings
  DROP CONSTRAINT event_player_ratings_pkey;

-- 2. Make stage_id nullable (will be NULL when group_id is set)
ALTER TABLE event_player_ratings
  ALTER COLUMN stage_id DROP NOT NULL;

-- 3. Add group_id (NULL when scoped to a standalone stage)
ALTER TABLE event_player_ratings
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE;

-- 4. XOR constraint: exactly one of stage_id / group_id must be set
ALTER TABLE event_player_ratings
  ADD CONSTRAINT chk_elo_scope
    CHECK ((stage_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1);

-- 5. Partial unique indexes replacing the old PK
CREATE UNIQUE INDEX IF NOT EXISTS uq_elo_stage_user
  ON event_player_ratings (stage_id, user_id)
  WHERE stage_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_elo_group_user
  ON event_player_ratings (group_id, user_id)
  WHERE group_id IS NOT NULL;

-- 6. Replace old rank index with two scope-aware indexes
DROP INDEX IF EXISTS idx_event_player_ratings_rank;

CREATE INDEX IF NOT EXISTS idx_elo_stage_rank
  ON event_player_ratings (stage_id, rating DESC)
  WHERE stage_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_elo_group_rank
  ON event_player_ratings (group_id, rating DESC)
  WHERE group_id IS NOT NULL;
