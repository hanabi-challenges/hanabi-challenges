-- Make stage_index and game_index unique constraints deferrable so that
-- multi-row shifts within a transaction don't violate uniqueness mid-update.

ALTER TABLE event_stages
  DROP CONSTRAINT event_stages_event_id_stage_index_key;

ALTER TABLE event_stages
  ADD CONSTRAINT event_stages_event_id_stage_index_key
  UNIQUE (event_id, stage_index)
  DEFERRABLE INITIALLY IMMEDIATE;

ALTER TABLE event_stage_games
  DROP CONSTRAINT uq_stage_game_index;

ALTER TABLE event_stage_games
  ADD CONSTRAINT uq_stage_game_index
  UNIQUE (stage_id, game_index)
  DEFERRABLE INITIALLY IMMEDIATE;
