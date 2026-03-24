-- Migration 002: drop old event model, create new event model
--
-- Decision T-001: clean break. Export old event data to a JSON snapshot
-- *before* running this migration if you need to preserve historical records:
--   pg_dump --data-only --table=events --table=event_stages \
--           --table=event_teams --table=event_games <db> > old_event_snapshot.sql
--
-- Tables dropped: event_session_ladder_config, event_sessions,
--   event_session_rounds, event_session_presence,
--   event_session_round_players, event_session_round_team_results,
--   event_player_ratings (old), event_rating_ledger, event_game_templates,
--   event_games, game_participants, event_stage_team_statuses,
--   event_player_eligibilities, event_teams (old), team_memberships,
--   pending_team_members, event_stages (old), event_admins (old), events (old)
--
-- Badge tables (event_badge_set_links, event_challenge_badge_config,
--   event_badges, event_badge_awards) are dropped and recreated so their
--   FKs resolve against the new events and event_teams tables.
--
-- Schema per ADR 0004.

BEGIN;

------------------------------------------------------------
-- STEP 1: DROP OLD TABLES (CASCADE on each so any unexpected
-- dependencies introduced by intermediate schema.sql snapshots
-- or manually-applied patches are also removed cleanly)
------------------------------------------------------------

-- Deepest leaves
DROP TABLE IF EXISTS event_rating_ledger CASCADE;
DROP TABLE IF EXISTS event_session_round_team_results CASCADE;
DROP TABLE IF EXISTS event_session_round_players CASCADE;
DROP TABLE IF EXISTS event_session_presence CASCADE;
DROP TABLE IF EXISTS game_participants CASCADE;
DROP TABLE IF EXISTS event_stage_team_statuses CASCADE;
DROP TABLE IF EXISTS pending_team_members CASCADE;
DROP TABLE IF EXISTS team_memberships CASCADE;

-- Retained badge tables — drop now so events can be dropped cleanly;
-- recreated below once the new events table exists.
DROP TABLE IF EXISTS event_badge_awards CASCADE;
DROP TABLE IF EXISTS event_badge_set_links CASCADE;
DROP TABLE IF EXISTS event_challenge_badge_config CASCADE;
DROP TABLE IF EXISTS event_badges CASCADE;

-- Mid-level old event tables
DROP TABLE IF EXISTS event_player_eligibilities CASCADE;
DROP TABLE IF EXISTS event_games CASCADE;
DROP TABLE IF EXISTS event_game_templates CASCADE;
DROP TABLE IF EXISTS event_session_rounds CASCADE;
DROP TABLE IF EXISTS event_sessions CASCADE;
DROP TABLE IF EXISTS event_session_ladder_config CASCADE;
DROP TABLE IF EXISTS event_player_ratings CASCADE;
DROP TABLE IF EXISTS event_teams CASCADE;
DROP TABLE IF EXISTS event_stages CASCADE;
DROP TABLE IF EXISTS event_admins CASCADE;

-- Root
DROP TABLE IF EXISTS events CASCADE;

------------------------------------------------------------
-- STEP 2: CREATE NEW EVENT MODEL TABLES (ADR 0004)
------------------------------------------------------------

CREATE TABLE events (
  id                       SERIAL PRIMARY KEY,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL UNIQUE,
  short_description        TEXT,
  long_description         TEXT NOT NULL,
  published                BOOLEAN NOT NULL DEFAULT FALSE,
  registration_mode        TEXT NOT NULL DEFAULT 'ACTIVE'
                             CHECK (registration_mode IN ('ACTIVE', 'PASSIVE')),
  allowed_team_sizes       INTEGER[] NOT NULL,
  combined_leaderboard     BOOLEAN NOT NULL DEFAULT FALSE,
  variant_rule_json        JSONB,
  seed_rule_json           JSONB,
  aggregate_config_json    JSONB,
  registration_opens_at    TIMESTAMPTZ,
  registration_cutoff      TIMESTAMPTZ,
  allow_late_registration  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_admins (
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN')),
  granted_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE UNIQUE INDEX uq_event_one_owner
  ON event_admins (event_id)
  WHERE role = 'OWNER';

------------------------------------------------------------
-- STEP 3: RECREATE RETAINED BADGE TABLES (unchanged structure)
-- These were dropped to allow the events drop above.
------------------------------------------------------------

CREATE TABLE event_badge_set_links (
  id           SERIAL PRIMARY KEY,
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  badge_set_id INTEGER NOT NULL REFERENCES badge_sets(id) ON DELETE RESTRICT,
  purpose      TEXT NOT NULL CHECK (purpose IN ('season_overall', 'session_winner', 'challenge_overall')),
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, purpose),
  UNIQUE (badge_set_id)
);

CREATE INDEX idx_event_badge_set_links_event
  ON event_badge_set_links (event_id, sort_order, id);

CREATE INDEX idx_event_badge_set_links_badge_set
  ON event_badge_set_links (badge_set_id);

CREATE TABLE event_challenge_badge_config (
  event_id                     INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  podium_enabled               BOOLEAN NOT NULL DEFAULT TRUE,
  completion_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
  completion_requires_deadline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_badges (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL,
  rank        TEXT NOT NULL CHECK (rank IN ('1', '2', '3', 'completion', 'participation')),
  team_size   INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  UNIQUE (event_id, rank, team_size)
);

------------------------------------------------------------
-- STEP 4: CREATE REMAINING NEW TABLES
------------------------------------------------------------

CREATE TABLE event_stages (
  id                        SERIAL PRIMARY KEY,
  event_id                  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  stage_index               INTEGER NOT NULL,
  mechanism                 TEXT NOT NULL
                              CHECK (mechanism IN ('SEEDED_LEADERBOARD', 'GAUNTLET', 'MATCH_PLAY')),
  team_policy               TEXT NOT NULL
                              CHECK (team_policy IN ('SELF_FORMED', 'QUEUED')),
  team_scope                TEXT NOT NULL
                              CHECK (team_scope IN ('EVENT', 'STAGE')),
  attempt_policy            TEXT NOT NULL
                              CHECK (attempt_policy IN ('SINGLE', 'REQUIRED_ALL', 'BEST_OF_N', 'UNLIMITED_BEST')),
  time_policy               TEXT NOT NULL
                              CHECK (time_policy IN ('WINDOW', 'ROLLING', 'SCHEDULED')),
  game_scoring_config_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_scoring_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_rule_json         JSONB,
  seed_rule_json            JSONB,
  config_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at                 TIMESTAMPTZ,
  ends_at                   TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, stage_index)
);

CREATE TABLE event_stage_relationships (
  id               SERIAL PRIMARY KEY,
  source_stage_id  INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  target_stage_id  INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  filter_type      TEXT NOT NULL
                     CHECK (filter_type IN ('ALL', 'TOP_N', 'THRESHOLD', 'MANUAL')),
  filter_value     NUMERIC,
  seeding_method   TEXT NOT NULL DEFAULT 'RANKED'
                     CHECK (seeding_method IN ('RANKED', 'RANDOM', 'MANUAL')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_stage_id, target_stage_id)
);

CREATE TABLE event_stage_games (
  id            SERIAL PRIMARY KEY,
  stage_id      INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  game_index    INTEGER NOT NULL,
  team_size     INTEGER CHECK (team_size IN (2, 3, 4, 5, 6)),
  variant_id    INTEGER REFERENCES hanabi_variants(code),
  seed_payload  TEXT,
  max_score     INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (stage_id, game_index, team_size)
);

CREATE TABLE event_registrations (
  id             SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'ACTIVE'
                   CHECK (status IN ('PENDING', 'ACTIVE', 'WITHDRAWN')),
  registered_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

CREATE TABLE event_stage_opt_ins (
  id               SERIAL PRIMARY KEY,
  stage_id         INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  partner_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_id, user_id)
);

CREATE TABLE event_teams (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stage_id    INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  team_size   INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  source      TEXT NOT NULL DEFAULT 'REGISTERED'
                CHECK (source IN ('REGISTERED', 'QUEUED', 'FORMED')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_team_members (
  id             SERIAL PRIMARY KEY,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (event_team_id, user_id)
);

-- Now that event_teams exists, recreate the badge awards table
CREATE TABLE event_badge_awards (
  id             SERIAL PRIMARY KEY,
  event_badge_id INTEGER NOT NULL REFERENCES event_badges(id) ON DELETE CASCADE,
  team_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_badge_id, user_id)
);

CREATE TABLE event_gauntlet_attempts (
  id             SERIAL PRIMARY KEY,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_id       INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  completed      BOOLEAN NOT NULL DEFAULT FALSE,
  total_score    INTEGER,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  UNIQUE (event_team_id, stage_id, attempt_number)
);

CREATE TABLE event_game_results (
  id                   SERIAL PRIMARY KEY,
  event_team_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_game_id        INTEGER NOT NULL REFERENCES event_stage_games(id) ON DELETE CASCADE,
  attempt_id           INTEGER REFERENCES event_gauntlet_attempts(id) ON DELETE CASCADE,
  score                INTEGER NOT NULL,
  zero_reason          TEXT CHECK (zero_reason IN ('Strike Out', 'Time Out', 'VTK')),
  bottom_deck_risk     INTEGER,
  hanabi_live_game_id  BIGINT,
  played_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (event_team_id, stage_game_id, attempt_id)
);

CREATE TABLE event_game_result_participants (
  id              SERIAL PRIMARY KEY,
  game_result_id  INTEGER NOT NULL REFERENCES event_game_results(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (game_result_id, user_id)
);

CREATE TABLE event_matches (
  id              SERIAL PRIMARY KEY,
  stage_id        INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  round_number    INTEGER NOT NULL,
  team1_id        INTEGER NOT NULL REFERENCES event_teams(id),
  team2_id        INTEGER NOT NULL REFERENCES event_teams(id),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE')),
  winner_team_id  INTEGER REFERENCES event_teams(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_match_game_results (
  id           SERIAL PRIMARY KEY,
  match_id     INTEGER NOT NULL REFERENCES event_matches(id) ON DELETE CASCADE,
  game_index   INTEGER NOT NULL,
  variant_id   INTEGER REFERENCES hanabi_variants(code),
  seed_payload TEXT,
  team1_score  INTEGER,
  team2_score  INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (match_id, game_index)
);

CREATE TABLE event_match_play_entries (
  id             SERIAL PRIMARY KEY,
  stage_id       INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  seed           INTEGER,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (stage_id, event_team_id)
);

CREATE TABLE event_awards (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stage_id        INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  criteria_type   TEXT NOT NULL
                    CHECK (criteria_type IN ('RANK_POSITION', 'SCORE_THRESHOLD', 'PARTICIPATION', 'MANUAL')),
  criteria_value  JSONB,
  attribution     TEXT NOT NULL DEFAULT 'INDIVIDUAL'
                    CHECK (attribution IN ('INDIVIDUAL', 'TEAM')),
  team_size       INTEGER CHECK (team_size IN (2, 3, 4, 5, 6)),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_award_grants (
  id             SERIAL PRIMARY KEY,
  award_id       INTEGER NOT NULL REFERENCES event_awards(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_team_id  INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,
  granted_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (award_id, user_id)
);

CREATE TABLE event_player_ratings (
  stage_id        INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          NUMERIC(10, 3) NOT NULL DEFAULT 1000,
  games_played    INTEGER NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (stage_id, user_id)
);

CREATE INDEX idx_event_player_ratings_rank
  ON event_player_ratings (stage_id, rating DESC);

------------------------------------------------------------
-- STEP 5: Ensure hanabi_variants No Variant seed row exists
------------------------------------------------------------

INSERT INTO hanabi_variants (code, name, label)
VALUES (0, 'No Variant', 'No Variant')
ON CONFLICT (code) DO NOTHING;

COMMIT;
