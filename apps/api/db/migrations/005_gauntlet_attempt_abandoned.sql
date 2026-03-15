ALTER TABLE event_gauntlet_attempts
  ADD COLUMN abandoned BOOLEAN NOT NULL DEFAULT FALSE;
