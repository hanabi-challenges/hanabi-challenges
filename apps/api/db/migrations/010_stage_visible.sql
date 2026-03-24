-- Add visible flag to event_stages (default false = hidden until explicitly published)
ALTER TABLE event_stages ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT FALSE;
