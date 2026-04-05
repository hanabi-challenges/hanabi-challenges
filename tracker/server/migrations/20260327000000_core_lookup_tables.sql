-- Up Migration

CREATE TABLE ticket_types (
  id         SMALLINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name       TEXT     NOT NULL,
  slug       TEXT     NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO ticket_types (name, slug, sort_order) VALUES
  ('Bug',             'bug',             1),
  ('Feature Request', 'feature_request', 2),
  ('Question',        'question',        3),
  ('Feedback',        'feedback',        4),
  ('Other',           'other',           5);

CREATE TABLE domains (
  id         SMALLINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name       TEXT     NOT NULL,
  slug       TEXT     NOT NULL UNIQUE,
  sort_order SMALLINT NOT NULL DEFAULT 0
);

INSERT INTO domains (name, slug, sort_order) VALUES
  ('Gameplay & Rules', 'gameplay',     1),
  ('Scoring',          'scoring',      2),
  ('Registration',     'registration', 3),
  ('Interface',        'interface',    4),
  ('Matchmaking',      'matchmaking',  5),
  ('Events & Formats', 'events',       6),
  ('Discord',          'discord',      7),
  ('Other',            'other',        8);

CREATE TABLE statuses (
  id          SMALLINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name        TEXT     NOT NULL,
  slug        TEXT     NOT NULL UNIQUE,
  description TEXT     NOT NULL DEFAULT '',
  is_terminal BOOLEAN  NOT NULL DEFAULT FALSE
);

INSERT INTO statuses (name, slug, description, is_terminal) VALUES
  ('Submitted', 'submitted', 'Ticket has been submitted and is awaiting triage.',                    FALSE),
  ('Triaged',   'triaged',   'Ticket has been reviewed and accepted for consideration.',             FALSE),
  ('In Review', 'in_review', 'Ticket is under active committee review.',                             FALSE),
  ('Decided',   'decided',   'Committee has made a decision on this ticket.',                        FALSE),
  ('Resolved',  'resolved',  'Ticket has been implemented or otherwise resolved.',                   TRUE),
  ('Rejected',  'rejected',  'Ticket has been rejected as out of scope or not actionable.',          TRUE),
  ('Closed',    'closed',    'Ticket has been closed without a decision (duplicate, invalid, etc.).', TRUE);

CREATE TABLE roles (
  id   SMALLINT NOT NULL PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  name TEXT     NOT NULL UNIQUE
);

INSERT INTO roles (name) VALUES
  ('community_member'),
  ('moderator'),
  ('committee');

CREATE TABLE valid_transitions (
  from_status_id SMALLINT NOT NULL REFERENCES statuses (id),
  to_status_id   SMALLINT NOT NULL REFERENCES statuses (id),
  role_id        SMALLINT NOT NULL REFERENCES roles (id),
  PRIMARY KEY (from_status_id, to_status_id, role_id),
  CHECK (from_status_id <> to_status_id)
);

-- Seed valid transitions using slugs to avoid hardcoded identity values.
WITH
  s AS (SELECT id, slug FROM statuses),
  r AS (SELECT id, name FROM roles)
INSERT INTO valid_transitions (from_status_id, to_status_id, role_id)
SELECT s_from.id, s_to.id, r.id
FROM (VALUES
  -- moderator: triage incoming tickets
  ('submitted', 'triaged',   'moderator'),
  ('submitted', 'rejected',  'moderator'),
  ('submitted', 'closed',    'moderator'),
  -- moderator: advance or close triaged tickets
  ('triaged',   'in_review', 'moderator'),
  ('triaged',   'rejected',  'moderator'),
  ('triaged',   'closed',    'moderator'),
  -- moderator: close or resolve decided tickets
  ('decided',   'resolved',  'moderator'),
  ('decided',   'closed',    'moderator'),
  -- committee: same control over incoming tickets as moderator
  ('submitted', 'triaged',   'committee'),
  ('submitted', 'rejected',  'committee'),
  ('submitted', 'closed',    'committee'),
  -- committee: advance or close triaged tickets
  ('triaged',   'in_review', 'committee'),
  ('triaged',   'rejected',  'committee'),
  ('triaged',   'closed',    'committee'),
  -- committee: decide or close in-review tickets
  ('in_review', 'decided',   'committee'),
  ('in_review', 'closed',    'committee'),
  -- committee: resolve or close decided tickets
  ('decided',   'resolved',  'committee'),
  ('decided',   'closed',    'committee')
) AS t (from_slug, to_slug, role_name)
JOIN s AS s_from ON s_from.slug = t.from_slug
JOIN s AS s_to   ON s_to.slug   = t.to_slug
JOIN r           ON r.name      = t.role_name;

CREATE TABLE permissions (
  role_id SMALLINT NOT NULL REFERENCES roles (id),
  action  TEXT     NOT NULL,
  PRIMARY KEY (role_id, action)
);

-- Seed permissions.
WITH r AS (SELECT id, name FROM roles)
INSERT INTO permissions (role_id, action)
SELECT r.id, t.action
FROM (VALUES
  ('community_member', 'ticket.create'),
  ('community_member', 'ticket.comment'),
  ('community_member', 'ticket.vote'),
  ('moderator',        'ticket.create'),
  ('moderator',        'ticket.comment'),
  ('moderator',        'ticket.vote'),
  ('moderator',        'ticket.triage'),
  ('moderator',        'ticket.transition'),
  ('moderator',        'ticket.view_internal'),
  ('committee',        'ticket.create'),
  ('committee',        'ticket.comment'),
  ('committee',        'ticket.vote'),
  ('committee',        'ticket.triage'),
  ('committee',        'ticket.transition'),
  ('committee',        'ticket.view_internal'),
  ('committee',        'ticket.decide'),
  ('committee',        'user.role.assign')
) AS t (role_name, action)
JOIN r ON r.name = t.role_name;

-- Down Migration

DROP TABLE permissions;
DROP TABLE valid_transitions;
DROP TABLE roles;
DROP TABLE statuses;
DROP TABLE domains;
DROP TABLE ticket_types;
