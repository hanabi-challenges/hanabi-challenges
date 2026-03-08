-- Migration 001: sim infrastructure and pending_validations enforcement
-- Apply this against any existing database that was bootstrapped before this change.

------------------------------------------------------------
-- New columns on existing tables
------------------------------------------------------------

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sim_run_id INTEGER;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS sim_run_id INTEGER;

------------------------------------------------------------
-- SIM API TOKENS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sim_api_tokens (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);

------------------------------------------------------------
-- SIM RUNS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sim_runs (
  id SERIAL PRIMARY KEY,
  label TEXT,
  created_by_token_id INTEGER REFERENCES sim_api_tokens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gc_at TIMESTAMPTZ
);

------------------------------------------------------------
-- PENDING VALIDATIONS
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pending_validations (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('challenge', 'session_round')),
  event_team_id INTEGER REFERENCES event_teams(id) ON DELETE CASCADE,
  event_game_template_id INTEGER REFERENCES event_game_templates(id) ON DELETE CASCADE,
  round_id INTEGER REFERENCES event_session_rounds(id) ON DELETE CASCADE,
  team_no INTEGER,
  game_id BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_validations_challenge
  ON pending_validations (event_team_id, event_game_template_id)
  WHERE kind = 'challenge';

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_validations_session_round
  ON pending_validations (round_id, team_no)
  WHERE kind = 'session_round';
