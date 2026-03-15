ALTER TABLE event_game_results
  ADD COLUMN corrected_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN corrected_at  TIMESTAMPTZ;
