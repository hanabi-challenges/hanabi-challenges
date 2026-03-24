-- Stage groups: ADR 0005
-- Creates event_stage_groups, adds group_id to event_stages,
-- and makes event_stage_relationships polymorphic (source is stage OR group).

-- 1. Create the group table
CREATE TABLE IF NOT EXISTS event_stage_groups (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  group_index         INTEGER NOT NULL,
  scoring_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, group_index)
);

-- 2. Add group membership to stages (null = ungrouped)
ALTER TABLE event_stages
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES event_stage_groups(id) ON DELETE SET NULL;

-- 3. Make source_stage_id nullable
ALTER TABLE event_stage_relationships
  ALTER COLUMN source_stage_id DROP NOT NULL;

-- 4. Add source_group_id
ALTER TABLE event_stage_relationships
  ADD COLUMN IF NOT EXISTS source_group_id INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE;

-- 5. XOR constraint: exactly one source must be set
ALTER TABLE event_stage_relationships
  ADD CONSTRAINT chk_relationship_source
    CHECK ((source_stage_id IS NOT NULL)::int + (source_group_id IS NOT NULL)::int = 1);

-- 6. Replace old composite unique constraint with two partial unique indexes
ALTER TABLE event_stage_relationships
  DROP CONSTRAINT IF EXISTS event_stage_relationships_source_stage_id_target_stage_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_stage_source
  ON event_stage_relationships (source_stage_id, target_stage_id)
  WHERE source_stage_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_rel_group_source
  ON event_stage_relationships (source_group_id, target_stage_id)
  WHERE source_group_id IS NOT NULL;
