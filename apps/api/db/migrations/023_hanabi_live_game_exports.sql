-- Cache table for raw hanab.live game export payloads.
--
-- Stores the full export (players, deck, actions, options) indexed by
-- hanab.live game ID so that KPIs can be recomputed locally without
-- re-fetching from hanab.live.
--
-- Relationship: event_game_results.hanabi_live_game_id → this table's game_id.
-- No FK is enforced here because manually-submitted results may reference
-- game IDs we never fetched an export for.

CREATE TABLE hanabi_live_game_exports (
  game_id          BIGINT      NOT NULL PRIMARY KEY,
  seed             TEXT        NOT NULL DEFAULT '',
  players          TEXT[]      NOT NULL,
  score            SMALLINT    NOT NULL DEFAULT 0,
  end_condition    SMALLINT    NOT NULL DEFAULT 1,
  variant_id       INTEGER,
  options_json     JSONB       NOT NULL DEFAULT '{}',
  datetime_started TIMESTAMPTZ,
  datetime_finished TIMESTAMPTZ,
  actions          JSONB       NOT NULL DEFAULT '[]',
  deck             JSONB       NOT NULL DEFAULT '[]',
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
