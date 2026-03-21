-- Replace team_policy (SELF_FORMED | QUEUED) with participation_type (TEAM | INDIVIDUAL).
-- Semantics are preserved:
--   SELF_FORMED  → TEAM        players register and compete as pre-formed teams
--   QUEUED       → INDIVIDUAL  players opt-in individually; teams are assigned by the draw
--
-- Also adds team_assignment_config to event_stage_transitions so that each
-- transition node can specify how teams should be formed for the next stage.
-- Shape: { "algorithm": "RANDOM" | "BALANCED" | "MANUAL", "team_size": <int> }
-- NULL means carry over existing teams unchanged.

-- 1. Add new column (nullable during backfill, then constrained)
ALTER TABLE event_stages
  ADD COLUMN participation_type TEXT;

-- 2. Back-fill from existing team_policy data
UPDATE event_stages
  SET participation_type = CASE
    WHEN team_policy = 'QUEUED' THEN 'INDIVIDUAL'
    ELSE 'TEAM'
  END;

-- 3. Apply NOT NULL + CHECK constraint
ALTER TABLE event_stages
  ALTER COLUMN participation_type SET NOT NULL,
  ADD CONSTRAINT chk_participation_type
    CHECK (participation_type IN ('INDIVIDUAL', 'TEAM'));

-- 4. Drop superseded column
ALTER TABLE event_stages DROP COLUMN team_policy;

-- 5. Add team_assignment_config to transitions
ALTER TABLE event_stage_transitions
  ADD COLUMN team_assignment_config JSONB;
