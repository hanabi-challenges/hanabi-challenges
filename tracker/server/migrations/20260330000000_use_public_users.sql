-- Up Migration
-- Replace tracker-owned users table with direct references to public.users.
-- User identity (display_name, colors) is owned by the main application.
-- Tracker-specific settings move to tracker_user_settings.
-- Tracker role assignments move to tracker_role_assignments.

-- ── Step 1: Add new INTEGER columns ─────────────────────────────────────────

ALTER TABLE tickets               ADD COLUMN submitted_by_new        INTEGER;
ALTER TABLE tickets               ADD COLUMN flagged_by_new          INTEGER;
ALTER TABLE ticket_types          ADD COLUMN template_updated_by_new INTEGER;
ALTER TABLE ticket_status_history ADD COLUMN changed_by_new          INTEGER;
ALTER TABLE ticket_comments       ADD COLUMN author_id_new           INTEGER;
ALTER TABLE ticket_votes          ADD COLUMN user_id_new             INTEGER;
ALTER TABLE ticket_subscriptions  ADD COLUMN user_id_new             INTEGER;
ALTER TABLE notification_events   ADD COLUMN actor_id_new            INTEGER;
ALTER TABLE user_notifications    ADD COLUMN user_id_new             INTEGER;
ALTER TABLE discord_identities    ADD COLUMN user_id_new             INTEGER;
ALTER TABLE ticket_pins           ADD COLUMN user_id_new             INTEGER;

-- ── Step 2: Populate via display_name join ──────────────────────────────────

UPDATE tickets t
SET submitted_by_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = t.submitted_by;

UPDATE tickets t
SET flagged_by_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = t.flagged_by;

UPDATE ticket_types tt
SET template_updated_by_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = tt.template_updated_by;

-- GitHub Bot has no public.users entry; those rows stay NULL (changed_by becomes nullable).
UPDATE ticket_status_history h
SET changed_by_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = h.changed_by;

UPDATE ticket_comments c
SET author_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = c.author_id;

UPDATE ticket_votes v
SET user_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = v.user_id;

UPDATE ticket_subscriptions s
SET user_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = s.user_id;

-- GitHub Bot events get NULL actor_id (actor_id becomes nullable).
UPDATE notification_events e
SET actor_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = e.actor_id;

UPDATE user_notifications n
SET user_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = n.user_id;

UPDATE discord_identities di
SET user_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = di.user_id;

UPDATE ticket_pins tp
SET user_id_new = pu.id
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.id = tp.user_id;

-- ── Step 3: Drop composite PKs / unique constraints on old columns ───────────

ALTER TABLE ticket_votes         DROP CONSTRAINT ticket_votes_pkey;
ALTER TABLE ticket_subscriptions DROP CONSTRAINT ticket_subscriptions_pkey;
ALTER TABLE ticket_pins          DROP CONSTRAINT ticket_pins_pkey;

-- ── Step 4: Drop old UUID columns (cascades associated FKs & constraints) ───

ALTER TABLE tickets               DROP COLUMN submitted_by;
ALTER TABLE tickets               DROP COLUMN flagged_by;
ALTER TABLE ticket_types          DROP COLUMN template_updated_by;
ALTER TABLE ticket_status_history DROP COLUMN changed_by;
ALTER TABLE ticket_comments       DROP COLUMN author_id;
ALTER TABLE ticket_votes          DROP COLUMN user_id;
ALTER TABLE ticket_subscriptions  DROP COLUMN user_id;
ALTER TABLE notification_events   DROP COLUMN actor_id;
ALTER TABLE user_notifications    DROP COLUMN user_id;
ALTER TABLE discord_identities    DROP COLUMN user_id;
ALTER TABLE ticket_pins           DROP COLUMN user_id;

-- ── Step 5: Rename new columns ───────────────────────────────────────────────

ALTER TABLE tickets               RENAME COLUMN submitted_by_new        TO submitted_by;
ALTER TABLE tickets               RENAME COLUMN flagged_by_new          TO flagged_by;
ALTER TABLE ticket_types          RENAME COLUMN template_updated_by_new TO template_updated_by;
ALTER TABLE ticket_status_history RENAME COLUMN changed_by_new          TO changed_by;
ALTER TABLE ticket_comments       RENAME COLUMN author_id_new           TO author_id;
ALTER TABLE ticket_votes          RENAME COLUMN user_id_new             TO user_id;
ALTER TABLE ticket_subscriptions  RENAME COLUMN user_id_new             TO user_id;
ALTER TABLE notification_events   RENAME COLUMN actor_id_new            TO actor_id;
ALTER TABLE user_notifications    RENAME COLUMN user_id_new             TO user_id;
ALTER TABLE discord_identities    RENAME COLUMN user_id_new             TO user_id;
ALTER TABLE ticket_pins           RENAME COLUMN user_id_new             TO user_id;

-- ── Step 6: Add NOT NULL where required ─────────────────────────────────────

ALTER TABLE tickets               ALTER COLUMN submitted_by SET NOT NULL;
ALTER TABLE ticket_comments       ALTER COLUMN author_id    SET NOT NULL;
ALTER TABLE ticket_votes          ALTER COLUMN user_id      SET NOT NULL;
ALTER TABLE ticket_subscriptions  ALTER COLUMN user_id      SET NOT NULL;
ALTER TABLE user_notifications    ALTER COLUMN user_id      SET NOT NULL;
ALTER TABLE discord_identities    ALTER COLUMN user_id      SET NOT NULL;
ALTER TABLE ticket_pins           ALTER COLUMN user_id      SET NOT NULL;
-- changed_by and actor_id are intentionally nullable: system-triggered events have no actor.

-- ── Step 7: Restore composite PKs ────────────────────────────────────────────

ALTER TABLE ticket_votes         ADD PRIMARY KEY (ticket_id, user_id);
ALTER TABLE ticket_subscriptions ADD PRIMARY KEY (ticket_id, user_id);
ALTER TABLE ticket_pins          ADD PRIMARY KEY (ticket_id, user_id);

-- ── Step 8: Add FK constraints to public.users ───────────────────────────────

ALTER TABLE tickets ADD CONSTRAINT fk_tickets_submitted_by
  FOREIGN KEY (submitted_by) REFERENCES public.users (id);
ALTER TABLE tickets ADD CONSTRAINT fk_tickets_flagged_by
  FOREIGN KEY (flagged_by) REFERENCES public.users (id);
ALTER TABLE ticket_types ADD CONSTRAINT fk_ticket_types_template_updated_by
  FOREIGN KEY (template_updated_by) REFERENCES public.users (id);
ALTER TABLE ticket_status_history ADD CONSTRAINT fk_history_changed_by
  FOREIGN KEY (changed_by) REFERENCES public.users (id);
ALTER TABLE ticket_comments ADD CONSTRAINT fk_comments_author_id
  FOREIGN KEY (author_id) REFERENCES public.users (id);
ALTER TABLE ticket_votes ADD CONSTRAINT fk_votes_user_id
  FOREIGN KEY (user_id) REFERENCES public.users (id);
ALTER TABLE ticket_subscriptions ADD CONSTRAINT fk_subscriptions_user_id
  FOREIGN KEY (user_id) REFERENCES public.users (id);
ALTER TABLE notification_events ADD CONSTRAINT fk_notification_events_actor_id
  FOREIGN KEY (actor_id) REFERENCES public.users (id);
ALTER TABLE user_notifications ADD CONSTRAINT fk_user_notifications_user_id
  FOREIGN KEY (user_id) REFERENCES public.users (id);
ALTER TABLE discord_identities ADD CONSTRAINT fk_discord_identities_user_id
  FOREIGN KEY (user_id) REFERENCES public.users (id);
ALTER TABLE ticket_pins ADD CONSTRAINT fk_ticket_pins_user_id
  FOREIGN KEY (user_id) REFERENCES public.users (id);

ALTER TABLE discord_identities ADD CONSTRAINT uq_discord_identities_user_id UNIQUE (user_id);

-- ── Step 9: tracker_user_settings (account_status per user) ──────────────────

CREATE TABLE tracker_user_settings (
  user_id        INTEGER     NOT NULL REFERENCES public.users (id) PRIMARY KEY,
  account_status TEXT        NOT NULL DEFAULT 'active'
                 CHECK (account_status IN ('active', 'restricted', 'banned')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migrate non-default account statuses
INSERT INTO tracker_user_settings (user_id, account_status)
SELECT pu.id, u.account_status
FROM users u
JOIN public.users pu ON pu.display_name = u.display_name
WHERE u.account_status != 'active'
  AND u.display_name != 'GitHub Bot';

-- ── Step 10: tracker_role_assignments (replaces user_role_assignments) ────────

CREATE TABLE tracker_role_assignments (
  id         UUID        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    INTEGER     NOT NULL REFERENCES public.users (id),
  role_id    SMALLINT    NOT NULL REFERENCES roles (id),
  source     TEXT        NOT NULL DEFAULT 'manual'
             CHECK (source IN ('manual', 'discord_sync')),
  granted_by INTEGER     REFERENCES public.users (id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by INTEGER     REFERENCES public.users (id)
);

INSERT INTO tracker_role_assignments (id, user_id, role_id, source, granted_at, revoked_at)
SELECT ura.id, pu.id, ura.role_id, ura.source, ura.granted_at, ura.revoked_at
FROM user_role_assignments ura
JOIN users u ON u.id = ura.user_id
JOIN public.users pu ON pu.display_name = u.display_name;

CREATE UNIQUE INDEX uq_active_tracker_role
  ON tracker_role_assignments (user_id, role_id)
  WHERE revoked_at IS NULL;

-- ── Step 11: Drop old tables ──────────────────────────────────────────────────

DROP TABLE user_role_assignments;
DROP TABLE users;

-- Down Migration
-- This migration cannot be automatically reversed (UUID → INTEGER conversion is lossy).
-- To restore: recreate tracker.users from public.users and re-migrate all foreign keys.

DROP TABLE tracker_role_assignments;
DROP TABLE tracker_user_settings;
