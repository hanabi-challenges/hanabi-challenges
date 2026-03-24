-- Add stage template to groups (optional sparse config used for bulk scaffold)
ALTER TABLE event_stage_groups ADD COLUMN IF NOT EXISTS template_json JSONB;
