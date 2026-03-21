-- Add team_scope propagation default to events
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS team_scope TEXT
    CHECK (team_scope IN ('EVENT', 'STAGE'));
