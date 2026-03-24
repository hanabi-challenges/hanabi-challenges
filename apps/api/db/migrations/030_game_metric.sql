-- Add game_metric to event_stages.
--
-- game_metric controls how a single game result is reduced to a comparable
-- value for both per-attempt aggregation (GAUNTLET) and stage ranking
-- (SEEDED_LEADERBOARD):
--
--   SCORE     — use the raw score value.  Aggregate = SUM(score).
--   MAX_SCORE — whether the team achieved the variant's maximum possible
--               score.  Aggregate = COUNT(*) WHERE score = game.max_score.
--
-- max_score on event_stage_games is now a required computed column: it must
-- be populated at slot creation time (num_suits × stack_size from the
-- resolved variant) so aggregate queries can compare without joining back to
-- hanabi_variants.

ALTER TABLE event_stages
  ADD COLUMN game_metric TEXT NOT NULL DEFAULT 'SCORE'
    CHECK (game_metric IN ('SCORE', 'MAX_SCORE'));
