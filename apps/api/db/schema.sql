-- Enable extensions
CREATE EXTENSION IF NOT EXISTS citext;

DROP TABLE IF EXISTS pending_team_members CASCADE;
DROP TABLE IF EXISTS event_admins CASCADE;
DROP TABLE IF EXISTS event_challenge_badge_config CASCADE;
DROP TABLE IF EXISTS event_badge_set_links CASCADE;
DROP TABLE IF EXISTS badge_sets CASCADE;
DROP TABLE IF EXISTS event_rating_ledger CASCADE;
DROP TABLE IF EXISTS event_player_ratings CASCADE;
DROP TABLE IF EXISTS event_session_round_team_results CASCADE;
DROP TABLE IF EXISTS event_session_round_players CASCADE;
DROP TABLE IF EXISTS event_session_presence CASCADE;
DROP TABLE IF EXISTS event_session_rounds CASCADE;
DROP TABLE IF EXISTS event_sessions CASCADE;
DROP TABLE IF EXISTS event_session_ladder_config CASCADE;
DROP TABLE IF EXISTS user_notifications CASCADE;
DROP TABLE IF EXISTS admin_access_requests CASCADE;
DROP TABLE IF EXISTS event_badge_awards CASCADE;
DROP TABLE IF EXISTS event_badges CASCADE;
DROP TABLE IF EXISTS event_stage_team_statuses CASCADE;
DROP TABLE IF EXISTS game_participants CASCADE;
DROP TABLE IF EXISTS event_games CASCADE;
DROP TABLE IF EXISTS event_game_templates CASCADE;
DROP TABLE IF EXISTS event_player_eligibilities CASCADE;
DROP TABLE IF EXISTS team_memberships CASCADE;
DROP TABLE IF EXISTS event_teams CASCADE;
DROP TABLE IF EXISTS event_stages CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP FUNCTION IF EXISTS notify_badge_award_insert() CASCADE;

------------------------------------------------------------
-- USERS
------------------------------------------------------------

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  display_name CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER'
    CHECK (role IN ('SUPERADMIN', 'ADMIN', 'USER')),
  color_hex TEXT NOT NULL DEFAULT '#777777',
  text_color TEXT NOT NULL DEFAULT '#ffffff'
    CHECK (text_color IN ('#000000', '#ffffff')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- EVENTS
-- Each row is a concrete run, e.g. "No Variant 2025"
------------------------------------------------------------

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  short_description TEXT,
  long_description TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  event_format TEXT NOT NULL DEFAULT 'challenge' CHECK (event_format IN ('challenge', 'tournament', 'session_ladder')),
  event_status TEXT NOT NULL DEFAULT 'DORMANT' CHECK (event_status IN ('DORMANT', 'LIVE', 'COMPLETE')),
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  round_robin_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  max_teams INTEGER CHECK (max_teams > 0),
  max_rounds INTEGER CHECK (max_rounds > 0),
  allow_late_registration BOOLEAN NOT NULL DEFAULT TRUE,
  registration_opens_at TIMESTAMPTZ,
  registration_cutoff TIMESTAMPTZ,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  CONSTRAINT chk_tournament_limits CHECK (max_teams IS NULL OR max_rounds IS NULL),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_admins (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

------------------------------------------------------------
-- BADGE SETS
------------------------------------------------------------

CREATE TABLE badge_sets (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  shape TEXT NOT NULL CHECK (shape IN ('circle', 'rounded-square', 'rounded-hexagon', 'diamond-facet', 'rosette')),
  symbol TEXT NOT NULL,
  icon_path TEXT,
  main_text TEXT NOT NULL,
  secondary_text TEXT NOT NULL,
  preview_svg TEXT NOT NULL,
  tier_config_json JSONB NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE event_badge_set_links (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  badge_set_id INTEGER NOT NULL REFERENCES badge_sets(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL CHECK (purpose IN ('season_overall', 'session_winner', 'challenge_overall')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, purpose),
  UNIQUE (badge_set_id)
);

CREATE INDEX idx_event_badge_set_links_event ON event_badge_set_links(event_id, sort_order, id);
CREATE INDEX idx_event_badge_set_links_badge_set ON event_badge_set_links(badge_set_id);

CREATE TABLE event_challenge_badge_config (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  podium_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  completion_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  completion_requires_deadline BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

------------------------------------------------------------
-- SESSION LADDER CONFIG
------------------------------------------------------------

CREATE TABLE event_session_ladder_config (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  team_size_mode TEXT NOT NULL DEFAULT 'hybrid_3_4'
    CHECK (team_size_mode IN ('fixed', 'hybrid_3_4')),
  team_size INTEGER
    CHECK (team_size IS NULL OR team_size IN (2, 3, 4, 5, 6)),
  k_factor INTEGER NOT NULL DEFAULT 24 CHECK (k_factor > 0),
  participation_bonus NUMERIC(8, 3) NOT NULL DEFAULT 0.5 CHECK (participation_bonus >= 0),
  rounds_per_session INTEGER NOT NULL DEFAULT 1 CHECK (rounds_per_session > 0),
  random_seed_salt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

------------------------------------------------------------
-- SESSION LADDER SESSIONS
------------------------------------------------------------

CREATE TABLE event_sessions (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_index INTEGER NOT NULL CHECK (session_index > 0),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, session_index)
);

CREATE INDEX idx_event_sessions_event ON event_sessions(event_id, session_index);

------------------------------------------------------------
-- SESSION LADDER ROUNDS
------------------------------------------------------------

CREATE TABLE event_session_rounds (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  round_index INTEGER NOT NULL CHECK (round_index > 0),
  seed_payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'assigning', 'playing', 'scoring', 'finalized')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (session_id, round_index)
);

CREATE INDEX idx_event_session_rounds_session ON event_session_rounds(session_id, round_index);

------------------------------------------------------------
-- SESSION PRESENCE
------------------------------------------------------------

CREATE TABLE event_session_presence (
  session_id INTEGER NOT NULL REFERENCES event_sessions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('playing', 'spectating')),
  state TEXT NOT NULL DEFAULT 'online' CHECK (state IN ('online', 'offline')),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (session_id, user_id)
);

------------------------------------------------------------
-- ROUND PLAYER SNAPSHOT
------------------------------------------------------------

CREATE TABLE event_session_round_players (
  round_id INTEGER NOT NULL REFERENCES event_session_rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('playing', 'spectating')),
  assigned_team_no INTEGER,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (round_id, user_id)
);

------------------------------------------------------------
-- ROUND TEAM RESULTS
------------------------------------------------------------

CREATE TABLE event_session_round_team_results (
  id SERIAL PRIMARY KEY,
  round_id INTEGER NOT NULL REFERENCES event_session_rounds(id) ON DELETE CASCADE,
  team_no INTEGER NOT NULL CHECK (team_no > 0),
  score INTEGER NOT NULL,
  end_condition INTEGER,
  bottom_deck_risk NUMERIC(8, 3),
  replay_game_id BIGINT,
  submitted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (round_id, team_no)
);

------------------------------------------------------------
-- PLAYER RATINGS (SESSION LADDER)
------------------------------------------------------------

CREATE TABLE event_player_ratings (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating NUMERIC(10, 3) NOT NULL DEFAULT 1000,
  games_played INTEGER NOT NULL DEFAULT 0,
  sessions_played INTEGER NOT NULL DEFAULT 0,
  last_played_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX idx_event_player_ratings_rank ON event_player_ratings(event_id, rating DESC);

------------------------------------------------------------
-- RATING LEDGER
------------------------------------------------------------

CREATE TABLE event_rating_ledger (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  round_id INTEGER NOT NULL REFERENCES event_session_rounds(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_rating NUMERIC(10, 3) NOT NULL,
  delta_competitive NUMERIC(10, 3) NOT NULL,
  delta_participation NUMERIC(10, 3) NOT NULL,
  new_rating NUMERIC(10, 3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

------------------------------------------------------------
-- HANABI VARIANT CATALOG (synced from hanabi.live)
------------------------------------------------------------

CREATE TABLE hanabi_variants (
  code INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hanabi_variant_sync_state (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX idx_event_rating_ledger_user_time
  ON event_rating_ledger(event_id, user_id, created_at DESC);

------------------------------------------------------------
-- EVENT TEAMS (scoped to a single event)
------------------------------------------------------------

CREATE TABLE event_teams (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  team_size INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  table_password TEXT,
  UNIQUE (event_id, name)
);

------------------------------------------------------------
-- EVENT PLAYER ELIGIBILITY
-- Tracks eligibility per event/team_size and whether spoilers are allowed
------------------------------------------------------------

CREATE TABLE event_player_eligibilities (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_size INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  status TEXT NOT NULL CHECK (status IN ('ENROLLED', 'INELIGIBLE', 'COMPLETED')),
  source_event_team_id INTEGER REFERENCES event_teams(id) ON DELETE SET NULL,
  status_reason TEXT,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id, team_size)
);

CREATE INDEX idx_event_player_eligibilities_lookup
  ON event_player_eligibilities (event_id, team_size);

------------------------------------------------------------
-- TEAM MEMBERSHIPS (players + managers)
------------------------------------------------------------

CREATE TABLE team_memberships (
  id SERIAL PRIMARY KEY,
  event_team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('PLAYER', 'STAFF')),
  is_listed BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_team_id, user_id, role)
);

------------------------------------------------------------
-- PENDING TEAM MEMBERS (not yet linked to a user)
------------------------------------------------------------
CREATE TABLE pending_team_members (
  id SERIAL PRIMARY KEY,
  event_team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('PLAYER', 'STAFF')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

------------------------------------------------------------
-- EVENT STAGES
-- Ordered collection of stages for an event
------------------------------------------------------------

CREATE TABLE event_stages (
  event_stage_id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stage_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  stage_type TEXT NOT NULL CHECK (stage_type IN ('SINGLE', 'ROUND_ROBIN', 'BRACKET', 'GAUNTLET')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  config_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, stage_index)
);

------------------------------------------------------------
-- EVENT GAME TEMPLATES
-- Fixed templates per event stage
------------------------------------------------------------

CREATE TABLE event_game_templates (
  id SERIAL PRIMARY KEY,
  event_stage_id INTEGER NOT NULL REFERENCES event_stages(event_stage_id) ON DELETE CASCADE,
  template_index INTEGER NOT NULL,
  variant TEXT NOT NULL DEFAULT 'No Variant',  -- e.g. 'No Variant', 'Rainbow', etc.
  max_score INTEGER NOT NULL DEFAULT 25,
  seed_payload TEXT, -- payload for this template
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_stage_id, template_index)
);

------------------------------------------------------------
-- EVENT GAMES
-- A single logged play of (event_team, event_game_template)
------------------------------------------------------------

CREATE TABLE event_games (
  id SERIAL PRIMARY KEY,
  event_team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  event_game_template_id INTEGER NOT NULL REFERENCES event_game_templates(id) ON DELETE CASCADE,
  game_id INTEGER,
  score INTEGER NOT NULL,
  zero_reason TEXT
    CHECK (zero_reason IN ('Strike Out', 'Time Out', 'VTK') OR zero_reason IS NULL),
  bottom_deck_risk INTEGER,
  notes TEXT,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_team_id, event_game_template_id)
);

------------------------------------------------------------
-- GAME PARTICIPANTS
-- Which subset of the team actually played this game
------------------------------------------------------------

CREATE TABLE game_participants (
  id SERIAL PRIMARY KEY,
  event_game_id INTEGER NOT NULL REFERENCES event_games(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_game_id, user_id)
);

------------------------------------------------------------
-- EVENT STAGE TEAM STATUSES
-- Per-team progress through a stage
------------------------------------------------------------

CREATE TABLE event_stage_team_statuses (
  event_stage_id INTEGER NOT NULL REFERENCES event_stages(event_stage_id) ON DELETE CASCADE,
  event_team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'complete', 'eliminated')),
  completed_at TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_stage_id, event_team_id)
);

------------------------------------------------------------
-- EVENT BADGES
-- Badge definitions scoped to a single event and team size
------------------------------------------------------------

CREATE TABLE event_badges (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  rank TEXT NOT NULL CHECK (rank IN ('1', '2', '3', 'completion', 'participation')),
  team_size INTEGER NOT NULL CHECK (team_size IN (2, 3, 4, 5, 6)),
  UNIQUE (event_id, rank, team_size)
);

------------------------------------------------------------
-- EVENT BADGE AWARDS
-- Award facts fan-out to users (one row per user)
------------------------------------------------------------

CREATE TABLE event_badge_awards (
  id SERIAL PRIMARY KEY,
  event_badge_id INTEGER NOT NULL REFERENCES event_badges(id) ON DELETE CASCADE,
  team_id INTEGER NOT NULL REFERENCES event_teams(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_badge_id, user_id)
);

------------------------------------------------------------
-- USER NOTIFICATIONS
-- Personal notification stream (e.g., badge awards)
------------------------------------------------------------

CREATE TABLE user_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('badge_awarded')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  v_badge_name TEXT;
  v_badge_icon TEXT;
  v_badge_rank TEXT;
  v_event_name TEXT;
  v_event_slug TEXT;
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
        'event_slug', v_event_slug,
        'event_name', v_event_name,
        'badge_name', v_badge_name,
        'badge_icon', v_badge_icon,
        'badge_rank', v_badge_rank
      )
    )
    RETURNING id INTO v_notification_id;

    PERFORM pg_notify(
      'user_notification',
      json_build_object(
        'user_id', NEW.user_id,
        'notification_id', v_notification_id,
        'kind', 'badge_awarded'
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
  id SERIAL PRIMARY KEY,
  requester_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied')) DEFAULT 'pending',
  reviewed_by_user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_access_requests_requester_created
  ON admin_access_requests (requester_user_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX uq_admin_access_requests_pending_per_user
  ON admin_access_requests (requester_user_id)
  WHERE status = 'pending';
