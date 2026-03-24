-- Add engine-derived KPI columns to event_game_results.
-- strikes:        number of bombs (misplays) in the game
-- clues_remaining: clue tokens left at game end
-- bottom_deck_risk is already present; populated automatically from the engine.
ALTER TABLE event_game_results ADD COLUMN strikes        SMALLINT;
ALTER TABLE event_game_results ADD COLUMN clues_remaining SMALLINT;
