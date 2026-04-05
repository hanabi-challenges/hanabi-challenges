-- Enable extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- Drop everything in reverse-dependency order for a clean slate
DROP TABLE IF EXISTS event_award_grants CASCADE;
DROP TABLE IF EXISTS event_awards CASCADE;
DROP TABLE IF EXISTS event_match_play_entries CASCADE;
DROP TABLE IF EXISTS event_match_game_results CASCADE;
DROP TABLE IF EXISTS event_matches CASCADE;
DROP TABLE IF EXISTS event_game_result_participants CASCADE;
DROP TABLE IF EXISTS event_game_results CASCADE;
DROP TABLE IF EXISTS event_gauntlet_attempts CASCADE;
DROP TABLE IF EXISTS event_badge_awards CASCADE;
DROP TABLE IF EXISTS event_team_members CASCADE;
DROP TABLE IF EXISTS event_teams CASCADE;
DROP TABLE IF EXISTS event_stage_opt_ins CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS event_stage_games CASCADE;
DROP TABLE IF EXISTS event_stage_relationships CASCADE;
DROP TABLE IF EXISTS event_player_ratings CASCADE;
DROP TABLE IF EXISTS event_stage_transitions CASCADE;
DROP TABLE IF EXISTS event_stage_groups CASCADE;
DROP TABLE IF EXISTS event_stages CASCADE;
DROP TABLE IF EXISTS event_badges CASCADE;
DROP TABLE IF EXISTS event_challenge_badge_config CASCADE;
DROP TABLE IF EXISTS event_badge_set_links CASCADE;
DROP TABLE IF EXISTS event_admins CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS badge_sets CASCADE;
DROP TABLE IF EXISTS user_notifications CASCADE;
DROP TABLE IF EXISTS admin_access_requests CASCADE;
DROP TABLE IF EXISTS hanabi_live_game_exports CASCADE;
DROP TABLE IF EXISTS hanabi_variant_sync_state CASCADE;
DROP TABLE IF EXISTS hanabi_variants CASCADE;
DROP TABLE IF EXISTS simulation_games CASCADE;
DROP SEQUENCE IF EXISTS simulation_game_id_seq CASCADE;
DROP TABLE IF EXISTS event_forfeitures CASCADE;
DROP TABLE IF EXISTS discord_pending_roles CASCADE;
DROP TABLE IF EXISTS discord_role_grants CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS schema_migrations CASCADE;
DROP FUNCTION IF EXISTS notify_badge_award_insert() CASCADE;

------------------------------------------------------------
-- USERS
------------------------------------------------------------

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  display_name  CITEXT NOT NULL UNIQUE,
  password_hash TEXT,  -- NULL for shadow accounts created by the replay ingestor
  roles         TEXT[] NOT NULL DEFAULT ARRAY['USER']::TEXT[]
                  CHECK (roles <@ ARRAY['USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN']::TEXT[])
                  CHECK ('USER' = ANY(roles)),
  color_hex     TEXT NOT NULL DEFAULT '#777777',
  text_color    TEXT NOT NULL DEFAULT '#ffffff'
                  CHECK (text_color IN ('#000000', '#ffffff')),
  token_version INTEGER NOT NULL DEFAULT 1,
  discord_id    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id
  ON users (discord_id) WHERE discord_id IS NOT NULL;

------------------------------------------------------------
-- DISCORD ROLE GRANTS
-- Maps (Discord guild_id, role_id) → site app_role.
-- The Discord bot reads this table to translate Discord roles
-- into site roles and pushes updates via POST /api/bot/roles.
------------------------------------------------------------

CREATE TABLE discord_role_grants (
  id          SERIAL      NOT NULL PRIMARY KEY,
  guild_id    TEXT        NOT NULL,
  role_id     TEXT        NOT NULL,
  app_role    TEXT        NOT NULL
                CHECK (app_role IN ('USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (guild_id, role_id)
);

------------------------------------------------------------
-- DISCORD PENDING ROLES
-- Stores role grants for Discord members who haven't yet linked a site account.
-- Applied and deleted when the user links their Discord account.
------------------------------------------------------------

CREATE TABLE discord_pending_roles (
  discord_id TEXT PRIMARY KEY,
  roles      TEXT[] NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

------------------------------------------------------------
-- HANABI VARIANT CATALOG (synced from hanabi.live)
------------------------------------------------------------

CREATE TABLE hanabi_variants (
  code       INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  label      TEXT NOT NULL,
  num_suits  INTEGER NOT NULL DEFAULT 5,
  is_sudoku  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hanabi_variant_sync_state (
  id            SMALLINT PRIMARY KEY CHECK (id = 1),
  last_synced_at TIMESTAMPTZ
);

-- Seed the canonical "No Variant" row so variant_id = 0 FK always resolves
INSERT INTO hanabi_variants (code, name, label)
VALUES (0, 'No Variant', 'No Variant')
ON CONFLICT (code) DO NOTHING;

------------------------------------------------------------
-- HANAB.LIVE GAME EXPORT CACHE
------------------------------------------------------------

CREATE TABLE hanabi_live_game_exports (
  game_id           BIGINT      NOT NULL PRIMARY KEY,
  seed              TEXT        NOT NULL DEFAULT '',
  players           TEXT[]      NOT NULL,
  score             SMALLINT    NOT NULL DEFAULT 0,
  end_condition     SMALLINT    NOT NULL DEFAULT 1,
  variant_id        INTEGER,
  options_json      JSONB       NOT NULL DEFAULT '{}',
  datetime_started  TIMESTAMPTZ,
  datetime_finished TIMESTAMPTZ,
  actions           JSONB       NOT NULL DEFAULT '[]',
  deck              JSONB       NOT NULL DEFAULT '[]',
  tags              TEXT[]      NOT NULL DEFAULT '{}',
  fetched_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hanabi_live_game_exports_tags
  ON hanabi_live_game_exports USING GIN (tags);

------------------------------------------------------------
-- EVENTS
-- Inert containers; status and dates are inferred from stages
------------------------------------------------------------

CREATE TABLE events (
  id                       SERIAL PRIMARY KEY,
  slug                     TEXT NOT NULL UNIQUE,
  name                     TEXT NOT NULL,
  short_description        TEXT,
  long_description         TEXT NOT NULL,
  published                BOOLEAN NOT NULL DEFAULT FALSE,
  registration_mode        TEXT NOT NULL DEFAULT 'ACTIVE'
                             CHECK (registration_mode IN ('ACTIVE', 'PASSIVE')),
  allowed_team_sizes       INTEGER[] NOT NULL,
  combined_leaderboard     BOOLEAN NOT NULL DEFAULT FALSE,
  team_scope               TEXT CHECK (team_scope IN ('EVENT', 'STAGE')),
  variant_rule_json        JSONB,
  seed_rule_json           JSONB,
  aggregate_config_json    JSONB,
  registration_opens_at    TIMESTAMPTZ,
  registration_cutoff      TIMESTAMPTZ,
  allow_late_registration  BOOLEAN NOT NULL DEFAULT TRUE,
  multi_registration       TEXT NOT NULL DEFAULT 'ONE_PER_SIZE'
                             CHECK (multi_registration IN ('ONE', 'ONE_PER_SIZE', 'UNRESTRICTED')),
  auto_pull_json           JSONB,    -- { "enabled": true, "interval_minutes": 60 }
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
-- BADGE SETS
------------------------------------------------------------

CREATE TABLE badge_sets (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  shape              TEXT NOT NULL
                       CHECK (shape IN ('circle', 'rounded-square', 'rounded-hexagon', 'diamond-facet', 'rosette')),
  symbol             TEXT NOT NULL,
  icon_path          TEXT,
  main_text          TEXT NOT NULL,
  secondary_text     TEXT NOT NULL,
  preview_svg        TEXT NOT NULL,
  tier_config_json   JSONB NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

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

------------------------------------------------------------
-- EVENT STAGES
------------------------------------------------------------

CREATE TABLE event_stages (
  id                        SERIAL PRIMARY KEY,
  event_id                  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label                     TEXT NOT NULL,
  stage_index               INTEGER NOT NULL,
  mechanism                 TEXT NOT NULL
                              CHECK (mechanism IN ('SEEDED_LEADERBOARD', 'GAUNTLET', 'MATCH_PLAY')),
  participation_type        TEXT NOT NULL DEFAULT 'TEAM'
                              CHECK (participation_type IN ('INDIVIDUAL', 'TEAM')),
  team_scope                TEXT NOT NULL
                              CHECK (team_scope IN ('EVENT', 'STAGE')),
  attempt_policy            TEXT NOT NULL
                              CHECK (attempt_policy IN ('SINGLE', 'REQUIRED_ALL', 'BEST_OF_N', 'UNLIMITED_BEST')),
  time_policy               TEXT NOT NULL
                              CHECK (time_policy IN ('WINDOW', 'ROLLING', 'SCHEDULED')),
  game_metric               TEXT NOT NULL DEFAULT 'SCORE'
                              CHECK (game_metric IN ('SCORE', 'MAX_SCORE')),
  game_scoring_config_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_scoring_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  variant_rule_json         JSONB,
  seed_rule_json            JSONB,
  config_json               JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_pull_json            JSONB,    -- { "enabled": true, "interval_minutes": 60 }; inherits from event
  starts_at                 TIMESTAMPTZ,
  ends_at                   TIMESTAMPTZ,
  visible                   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  group_id                  INTEGER,  -- FK added below after event_stage_groups is created
  CONSTRAINT event_stages_event_id_stage_index_key UNIQUE (event_id, stage_index) DEFERRABLE INITIALLY IMMEDIATE
);

------------------------------------------------------------
-- STAGE GROUPS (ADR 0005)
-- Optional aggregation layer over multiple stages.
-- A group produces a combined leaderboard from its member stages.
------------------------------------------------------------

CREATE TABLE event_stage_groups (
  id                  SERIAL PRIMARY KEY,
  event_id            INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  group_index         INTEGER NOT NULL,
  scoring_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_json       JSONB,
  visible             BOOLEAN NOT NULL DEFAULT TRUE,
  parent_group_id     INTEGER REFERENCES event_stage_groups(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, group_index)
);

-- Now add the FK from event_stages to event_stage_groups
ALTER TABLE event_stages
  ADD CONSTRAINT fk_stage_group FOREIGN KEY (group_id) REFERENCES event_stage_groups(id) ON DELETE SET NULL;

CREATE TABLE event_stage_transitions (
  id              SERIAL PRIMARY KEY,
  event_id        INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  after_stage_id  INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  after_group_id  INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE,
  filter_type     TEXT NOT NULL DEFAULT 'ALL'
                    CHECK (filter_type IN ('ALL', 'TOP_N', 'THRESHOLD', 'MANUAL')),
  filter_value    INTEGER,
  seeding_method  TEXT NOT NULL DEFAULT 'PRESERVE'
                    CHECK (seeding_method IN ('PRESERVE', 'RANKED', 'RANDOM', 'MANUAL')),
  team_assignment_config JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transition_predecessor
    CHECK ((after_stage_id IS NOT NULL)::int + (after_group_id IS NOT NULL)::int = 1),
  CONSTRAINT uq_transition_after_stage UNIQUE (after_stage_id),
  CONSTRAINT uq_transition_after_group UNIQUE (after_group_id)
);

CREATE TABLE event_stage_games (
  id            SERIAL PRIMARY KEY,
  stage_id      INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  game_index    INTEGER NOT NULL,
  nickname      TEXT,
  variant_id    INTEGER REFERENCES hanabi_variants(code),
  seed_payload             TEXT,
  max_score                INTEGER,
  last_replays_pulled_at   TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_stage_game_index UNIQUE (stage_id, game_index) DEFERRABLE INITIALLY IMMEDIATE
);

------------------------------------------------------------
-- REGISTRATION
------------------------------------------------------------

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

------------------------------------------------------------
-- TEAMS
-- stage_id NULL = event-scoped team; non-null = stage-scoped
------------------------------------------------------------

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
  confirmed      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (event_team_id, user_id)
);

------------------------------------------------------------
-- EVENT BADGES (per-event badge definitions)
------------------------------------------------------------

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

CREATE TABLE event_badge_awards (
  id             SERIAL PRIMARY KEY,
  event_badge_id INTEGER NOT NULL REFERENCES event_badges(id) ON DELETE CASCADE,
  team_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_badge_id, user_id)
);

------------------------------------------------------------
-- GAUNTLET ATTEMPTS
------------------------------------------------------------

CREATE TABLE event_gauntlet_attempts (
  id             SERIAL PRIMARY KEY,
  event_team_id  INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_id       INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  completed      BOOLEAN NOT NULL DEFAULT FALSE,
  total_score    INTEGER,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  completed_at   TIMESTAMPTZ,
  abandoned      BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (event_team_id, stage_id, attempt_number)
);

------------------------------------------------------------
-- GAME RESULTS (SEEDED_LEADERBOARD and GAUNTLET)
-- attempt_id NULL for SEEDED_LEADERBOARD; populated for GAUNTLET
------------------------------------------------------------

CREATE TABLE event_game_results (
  id                   SERIAL PRIMARY KEY,
  event_team_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  stage_game_id        INTEGER NOT NULL REFERENCES event_stage_games(id) ON DELETE CASCADE,
  attempt_id           INTEGER REFERENCES event_gauntlet_attempts(id) ON DELETE CASCADE,
  score                INTEGER NOT NULL,
  zero_reason          TEXT CHECK (zero_reason IN ('Strike Out', 'Time Out', 'VTK')),
  bottom_deck_risk     INTEGER,
  strikes              SMALLINT,
  clues_remaining      SMALLINT,
  hanabi_live_game_id  BIGINT,
  started_at           TIMESTAMPTZ,
  played_at            TIMESTAMPTZ DEFAULT NOW(),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  corrected_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  corrected_at         TIMESTAMPTZ,
  UNIQUE NULLS NOT DISTINCT (event_team_id, stage_game_id, attempt_id)
);

CREATE TABLE event_game_result_participants (
  id              SERIAL PRIMARY KEY,
  game_result_id  INTEGER NOT NULL REFERENCES event_game_results(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (game_result_id, user_id)
);

------------------------------------------------------------
-- MATCH PLAY
------------------------------------------------------------

CREATE TABLE event_matches (
  id              SERIAL PRIMARY KEY,
  stage_id        INTEGER NOT NULL REFERENCES event_stages(id) ON DELETE CASCADE,
  round_number    INTEGER NOT NULL,
  team1_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  team2_id        INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE')),
  winner_team_id  INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,
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

------------------------------------------------------------
-- AWARDS (criteria-based; parallel to badge system per ADR T-002)
-- stage_id NULL = event aggregate award
------------------------------------------------------------

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

------------------------------------------------------------
-- ELO RATINGS (scoped to group or standalone stage)
------------------------------------------------------------

CREATE TABLE event_player_ratings (
  stage_id        INTEGER REFERENCES event_stages(id) ON DELETE CASCADE,
  group_id        INTEGER REFERENCES event_stage_groups(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          NUMERIC(10, 3) NOT NULL DEFAULT 1000,
  games_played    INTEGER NOT NULL DEFAULT 0,
  last_played_at  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_elo_scope
    CHECK ((stage_id IS NOT NULL)::int + (group_id IS NOT NULL)::int = 1)
);

-- Exactly one of stage_id / group_id is set; partial unique indexes enforce uniqueness per scope
CREATE UNIQUE INDEX uq_elo_stage_user
  ON event_player_ratings (stage_id, user_id)
  WHERE stage_id IS NOT NULL;

CREATE UNIQUE INDEX uq_elo_group_user
  ON event_player_ratings (group_id, user_id)
  WHERE group_id IS NOT NULL;

CREATE INDEX idx_elo_stage_rank
  ON event_player_ratings (stage_id, rating DESC)
  WHERE stage_id IS NOT NULL;

CREATE INDEX idx_elo_group_rank
  ON event_player_ratings (group_id, rating DESC)
  WHERE group_id IS NOT NULL;

------------------------------------------------------------
-- EVENT FORFEITURES
------------------------------------------------------------

CREATE TABLE event_forfeitures (
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forfeited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

------------------------------------------------------------
-- USER NOTIFICATIONS
------------------------------------------------------------

CREATE TABLE user_notifications (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('badge_awarded', 'award_granted')),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at      TIMESTAMPTZ NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_notifications_user_created
  ON user_notifications (user_id, created_at DESC, id DESC);

CREATE INDEX idx_user_notifications_unread
  ON user_notifications (user_id, read_at);

CREATE OR REPLACE FUNCTION notify_badge_award_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_badge_name     TEXT;
  v_badge_icon     TEXT;
  v_badge_rank     TEXT;
  v_event_name     TEXT;
  v_event_slug     TEXT;
  v_notification_id INTEGER;
BEGIN
  SELECT
    eb.name,
    eb.icon,
    eb.rank,
    ev.name,
    ev.slug
  INTO
    v_badge_name,
    v_badge_icon,
    v_badge_rank,
    v_event_name,
    v_event_slug
  FROM event_badges eb
  JOIN events ev ON ev.id = eb.event_id
  WHERE eb.id = NEW.event_badge_id;

  IF v_badge_name IS NOT NULL THEN
    INSERT INTO user_notifications (
      user_id,
      kind,
      title,
      body,
      payload_json
    )
    VALUES (
      NEW.user_id,
      'badge_awarded',
      'Badge awarded',
      format('You earned "%s" in %s.', v_badge_name, v_event_name),
      jsonb_build_object(
        'event_badge_id', NEW.event_badge_id,
        'event_slug',     v_event_slug,
        'event_name',     v_event_name,
        'badge_name',     v_badge_name,
        'badge_icon',     v_badge_icon,
        'badge_rank',     v_badge_rank
      )
    )
    RETURNING id INTO v_notification_id;

    PERFORM pg_notify(
      'user_notification',
      json_build_object(
        'user_id',         NEW.user_id,
        'notification_id', v_notification_id,
        'kind',            'badge_awarded'
      )::text
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_badge_award_insert
AFTER INSERT ON event_badge_awards
FOR EACH ROW
EXECUTE FUNCTION notify_badge_award_insert();

------------------------------------------------------------
-- ADMIN ACCESS REQUESTS
------------------------------------------------------------

CREATE TABLE admin_access_requests (
  id                  SERIAL PRIMARY KEY,
  requester_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason              TEXT NULL,
  status              TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending',
  reviewed_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at         TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_access_requests_requester_created
  ON admin_access_requests (requester_user_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX uq_admin_access_requests_pending_per_user
  ON admin_access_requests (requester_user_id)
  WHERE status = 'pending';

------------------------------------------------------------
-- SIMULATION GAMES
-- Backs the mock hanab-live API server (SIMULATION_MODE=true).
------------------------------------------------------------

CREATE SEQUENCE simulation_game_id_seq START WITH 9000000000;

CREATE TABLE simulation_games (
  id                BIGINT      NOT NULL DEFAULT nextval('simulation_game_id_seq') PRIMARY KEY,
  full_seed         TEXT        NOT NULL,
  players           TEXT[]      NOT NULL,
  score             INTEGER     NOT NULL DEFAULT 0,
  end_condition     INTEGER     NOT NULL DEFAULT 1,
  options_json      JSONB       NOT NULL DEFAULT '{}',
  datetime_started  TIMESTAMPTZ,
  datetime_finished TIMESTAMPTZ,
  actions           JSONB       NOT NULL DEFAULT '[]',
  deck              JSONB       NOT NULL DEFAULT '[]',
  slot_id           BIGINT REFERENCES event_stage_games(id) ON DELETE SET NULL,
  ingest_outcome    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX simulation_games_full_seed_idx ON simulation_games (full_seed);
CREATE INDEX simulation_games_slot_id_idx ON simulation_games (slot_id);

------------------------------------------------------------
-- SCHEMA MIGRATIONS TRACKER
------------------------------------------------------------

CREATE TABLE IF NOT EXISTS schema_migrations (
  name       TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mark all migrations already reflected in this schema so the runtime
-- migration runner skips them on fresh installs.
INSERT INTO schema_migrations (name) VALUES
  ('001_variant_id.sql'),
  ('002_new_event_model.sql'),
  ('003_team_member_confirmed.sql'),
  ('004_result_correction_metadata.sql'),
  ('005_gauntlet_attempt_abandoned.sql'),
  ('006_result_started_at.sql'),
  ('007_stage_groups.sql'),
  ('008_stage_group_visible.sql'),
  ('009_stage_transitions.sql'),
  ('010_stage_visible.sql'),
  ('011_game_slots_redesign.sql'),
  ('012_deferrable_index_constraints.sql'),
  ('013_variant_suits_and_nickname.sql'),
  ('014_group_template.sql'),
  ('015_event_team_scope.sql'),
  ('016_drop_event_name_unique.sql'),
  ('017_event_multi_registration.sql'),
  ('018_shadow_users.sql'),
  ('019_replay_pull_config.sql'),
  ('020_result_kpis.sql'),
  ('021_participation_type.sql'),
  ('022_event_matches_cascade.sql'),
  ('023_hanabi_live_game_exports.sql'),
  ('024_elo_group_scope.sql'),
  ('025_event_forfeitures.sql'),
  ('026_game_export_tags.sql'),
  ('027_discord_role_grants.sql'),
  ('028_simulation_games.sql'),
  ('029_simulation_ingest_outcome.sql'),
  ('030_game_metric.sql'),
  ('031_roles_array.sql'),
  ('032_token_version.sql'),
  ('033_discord_role_grants_app_role.sql'),
  ('034_discord_pending_roles.sql')
ON CONFLICT (name) DO NOTHING;
