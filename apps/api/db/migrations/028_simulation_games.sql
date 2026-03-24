-- Simulation game store.
--
-- Backs the mock hanab-live API server (mounted when SIMULATION_MODE=true).
-- Simulation scripts INSERT rows here; ingestGameSlot() fetches them via the
-- mock server at HANAB_LIVE_BASE_URL instead of hitting hanab.live directly.
--
-- IDs start from 9,000,000,000 so they never collide with real hanab.live
-- game IDs in shared environments.

CREATE SEQUENCE IF NOT EXISTS simulation_game_id_seq START WITH 9000000000;

CREATE TABLE IF NOT EXISTS simulation_games (
  id             BIGINT      NOT NULL DEFAULT nextval('simulation_game_id_seq') PRIMARY KEY,
  full_seed      TEXT        NOT NULL,
  players        TEXT[]      NOT NULL,
  score          INTEGER     NOT NULL DEFAULT 0,
  end_condition  INTEGER     NOT NULL DEFAULT 1,
  options_json   JSONB       NOT NULL DEFAULT '{}',
  datetime_started  TIMESTAMPTZ,
  datetime_finished TIMESTAMPTZ,
  actions        JSONB       NOT NULL DEFAULT '[]',
  deck           JSONB       NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS simulation_games_full_seed_idx ON simulation_games (full_seed);
