-- Replay pull configuration: cascades from event → stage.
-- Structure: { "enabled": true, "interval_minutes": 60 }
-- NULL at a level means "inherit from parent"; stage overrides event.
ALTER TABLE events       ADD COLUMN auto_pull_json JSONB;
ALTER TABLE event_stages ADD COLUMN auto_pull_json JSONB;

-- Track when each game slot was last ingested so the scheduler knows when to
-- run next.
ALTER TABLE event_stage_games ADD COLUMN last_replays_pulled_at TIMESTAMPTZ;
