-- Add visible flag to event_stage_groups (default true = shown to users)
ALTER TABLE event_stage_groups ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT TRUE;
