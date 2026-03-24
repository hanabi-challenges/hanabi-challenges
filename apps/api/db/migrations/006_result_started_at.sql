ALTER TABLE event_game_results
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
