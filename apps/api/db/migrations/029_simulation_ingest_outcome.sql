-- Track which slot each simulated game belongs to, and what happened when it
-- was ingested.  These two columns together let the admin report show ALL
-- simulated games (not just the ones that made it into event_game_results)
-- with a per-row handling label.
--
-- slot_id     — FK back to event_stage_games; set when simulateGame() is called.
-- ingest_outcome — set after ingestGameSlot() processes the game:
--     'ingested'              successfully inserted into event_game_results
--     'skipped:already_played'  team already has a result for this slot
--     'skipped:repeat_player'   first-play-per-player dedup hit
--     'skipped:before_window'   game finished before stage starts_at
--     'skipped:after_window'    game finished after stage ends_at
--     'skipped:no_timestamp'    cannot determine play time, window enforced
--     'skipped:empty_export'    export was null or had no players
--     'skipped:multi_registration'  would violate multi-reg policy
--     'error:ambiguous_team'    multiple matching registered teams
--     'error:export_fetch'      failed to fetch game export
--     'error:user_resolution'   failed to resolve hanab.live players to users
--     'error:team_resolution'   unexpected team lookup error
--     'error:result_insert'     failed to write the result row

ALTER TABLE simulation_games
  ADD COLUMN IF NOT EXISTS slot_id         BIGINT REFERENCES event_stage_games(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ingest_outcome  TEXT;

CREATE INDEX IF NOT EXISTS simulation_games_slot_id_idx ON simulation_games (slot_id);
