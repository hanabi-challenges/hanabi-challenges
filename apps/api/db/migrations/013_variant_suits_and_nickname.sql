-- Add suit metadata to variant catalog
ALTER TABLE hanabi_variants ADD COLUMN IF NOT EXISTS num_suits INTEGER NOT NULL DEFAULT 5;
ALTER TABLE hanabi_variants ADD COLUMN IF NOT EXISTS is_sudoku BOOLEAN NOT NULL DEFAULT FALSE;

-- Add dev-only nickname to game slots
ALTER TABLE event_stage_games ADD COLUMN IF NOT EXISTS nickname TEXT;
