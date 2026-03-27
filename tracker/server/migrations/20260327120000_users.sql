-- Up Migration

CREATE TABLE users (
  id                 UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  hanablive_username TEXT        NOT NULL UNIQUE,
  display_name       TEXT        NOT NULL,
  account_status     TEXT        NOT NULL DEFAULT 'active'
                     CHECK (account_status IN ('active', 'restricted', 'banned')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks explicit role assignments for moderator and committee.
-- community_member is the implicit default and is never stored here.
-- Only one active assignment per (user, role) is permitted at any time;
-- enforced by the partial unique index below.
CREATE TABLE user_role_assignments (
  id         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users (id),
  role_id    SMALLINT    NOT NULL REFERENCES roles (id),
  source     TEXT        NOT NULL DEFAULT 'manual'
             CHECK (source IN ('manual', 'discord_sync')),
  granted_by UUID        REFERENCES users (id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID        REFERENCES users (id)
);

-- Prevents the same role from being actively assigned twice to the same user.
CREATE UNIQUE INDEX uq_active_user_role
  ON user_role_assignments (user_id, role_id)
  WHERE revoked_at IS NULL;

-- Down Migration

DROP INDEX uq_active_user_role;
DROP TABLE user_role_assignments;
DROP TABLE users;
