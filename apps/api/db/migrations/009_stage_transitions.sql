-- Replace event_stage_relationships with event_stage_transitions.
-- The new model is purely linear: each item in the stage ledger has at most
-- one outgoing transition (identified by after_stage_id or after_group_id).
-- parent_group_id reserved on groups for future nesting support.

DROP INDEX IF EXISTS uq_rel_stage_source;
DROP INDEX IF EXISTS uq_rel_group_source;
DROP TABLE IF EXISTS event_stage_relationships;

ALTER TABLE event_stage_groups
  ADD COLUMN IF NOT EXISTS parent_group_id INTEGER
    REFERENCES event_stage_groups(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS event_stage_transitions (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  after_stage_id  INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  after_group_id  INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE,
  filter_type     TEXT NOT NULL DEFAULT 'ALL'
                    CHECK (filter_type IN ('ALL', 'TOP_N', 'THRESHOLD', 'MANUAL')),
  filter_value    INTEGER,
  seeding_method  TEXT NOT NULL DEFAULT 'PRESERVE'
                    CHECK (seeding_method IN ('PRESERVE', 'RANKED', 'RANDOM', 'MANUAL')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transition_predecessor
    CHECK ((after_stage_id IS NOT NULL)::int + (after_group_id IS NOT NULL)::int = 1),
  CONSTRAINT uq_transition_after_stage UNIQUE (after_stage_id),
  CONSTRAINT uq_transition_after_group UNIQUE (after_group_id)
);
