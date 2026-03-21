-- Drop team_size (now an event-level configuration, not per-game)
ALTER TABLE event_stage_games DROP COLUMN IF EXISTS team_size;

-- Replace the old three-column unique constraint with a simple two-column one
ALTER TABLE event_stage_games DROP CONSTRAINT IF EXISTS event_stage_games_stage_id_game_index_team_size_key;
ALTER TABLE event_stage_games ADD CONSTRAINT uq_stage_game_index UNIQUE (stage_id, game_index);
