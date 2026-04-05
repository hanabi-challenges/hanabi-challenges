-- Migrate users.role (TEXT scalar) to users.roles (TEXT[]) to support
-- multiple independent roles per user: USER, HOST, MOD, SITE_ADMIN, SUPERADMIN.
--
-- Migration mapping:
--   USER       → {USER}
--   ADMIN      → {USER, HOST, SITE_ADMIN}   (ADMIN was events + content)
--   SUPERADMIN → {USER, SUPERADMIN}         (SUPERADMIN implies everything)

ALTER TABLE users
  ADD COLUMN roles TEXT[] NOT NULL DEFAULT ARRAY['USER']::TEXT[];

UPDATE users SET roles = ARRAY['USER']::TEXT[]                    WHERE role = 'USER';
UPDATE users SET roles = ARRAY['USER', 'HOST', 'SITE_ADMIN']::TEXT[] WHERE role = 'ADMIN';
UPDATE users SET roles = ARRAY['USER', 'SUPERADMIN']::TEXT[]     WHERE role = 'SUPERADMIN';

ALTER TABLE users DROP COLUMN role;

-- Every element must be a known role.
ALTER TABLE users
  ADD CONSTRAINT users_roles_valid
  CHECK (roles <@ ARRAY['USER', 'HOST', 'MOD', 'SITE_ADMIN', 'SUPERADMIN']::TEXT[]);

-- USER is always present (every authenticated account is a user).
ALTER TABLE users
  ADD CONSTRAINT users_roles_has_user
  CHECK ('USER' = ANY(roles));
