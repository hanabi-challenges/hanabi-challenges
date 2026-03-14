-- Migration 001: store variant as numeric ID instead of string name
--
-- event_game_templates.variant (TEXT) → variant_id (INTEGER FK → hanabi_variants.code)
-- The hanabi_variants catalog must be populated before this migration runs.
-- Any template whose variant name has no matching entry in hanabi_variants
-- defaults to 0 (No Variant).

BEGIN;

-- 1. Add new integer column (nullable for now so existing rows are accepted)
ALTER TABLE event_game_templates
  ADD COLUMN variant_id INTEGER REFERENCES hanabi_variants(code);

-- 2. Populate from the existing string column via the catalog
UPDATE event_game_templates egt
SET variant_id = hv.code
FROM hanabi_variants hv
WHERE hv.name = egt.variant;

-- 3. Anything that didn't match a known variant name falls back to 0 (No Variant)
UPDATE event_game_templates
SET variant_id = 0
WHERE variant_id IS NULL;

-- 4. Lock the column down: NOT NULL, default 0
ALTER TABLE event_game_templates
  ALTER COLUMN variant_id SET NOT NULL,
  ALTER COLUMN variant_id SET DEFAULT 0;

-- 5. Drop the old string column
ALTER TABLE event_game_templates
  DROP COLUMN variant;

-- 6. Migrate session ladder seed_payload JSON:
--    { "variant": "<name>", "seed": "..." }
--    → { "variant_id": <code>, "seed": "..." }
UPDATE event_session_rounds
SET seed_payload = (
  SELECT jsonb_build_object(
    'variant_id', COALESCE(hv.code, 0),
    'seed',       (payload->>'seed')
  )::text
  FROM jsonb_build_object(
         'variant', seed_payload::jsonb->>'variant',
         'seed',    seed_payload::jsonb->>'seed'
       ) AS parsed(payload)
  LEFT JOIN hanabi_variants hv ON hv.name = (payload->>'variant')
)
WHERE seed_payload IS NOT NULL
  AND seed_payload::jsonb ? 'variant';

COMMIT;
