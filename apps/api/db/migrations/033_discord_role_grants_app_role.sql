-- Update discord_role_grants.app_role to use the new role model.
-- Previously constrained to only 'ADMIN', now accepts any valid site role.
-- Existing 'ADMIN' rows (if any) are migrated to 'HOST', the closest equivalent.

UPDATE discord_role_grants SET app_role = 'HOST' WHERE app_role = 'ADMIN';

ALTER TABLE discord_role_grants
  DROP CONSTRAINT discord_role_grants_app_role_check;

ALTER TABLE discord_role_grants
  ALTER COLUMN app_role DROP DEFAULT;

ALTER TABLE discord_role_grants
  ADD CONSTRAINT discord_role_grants_app_role_check
    CHECK (app_role IN ('USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN'));
