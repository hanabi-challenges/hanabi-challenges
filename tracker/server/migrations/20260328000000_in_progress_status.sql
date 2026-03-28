-- Up Migration

-- Add in_progress status between decided and resolved.
-- Non-terminal: signals that engineering work is actively underway.
INSERT INTO statuses (name, slug, description, is_terminal) VALUES
  ('In Progress', 'in_progress', 'Ticket is being actively implemented.', FALSE);

-- Valid transitions involving in_progress.
-- Both moderator and committee may advance a decided ticket to in_progress,
-- and may then resolve or close it.
WITH
  s AS (SELECT id, slug FROM statuses),
  r AS (SELECT id, name FROM roles)
INSERT INTO valid_transitions (from_status_id, to_status_id, role_id)
SELECT s_from.id, s_to.id, r.id
FROM (VALUES
  ('decided',     'in_progress', 'moderator'),
  ('decided',     'in_progress', 'committee'),
  ('in_progress', 'resolved',    'moderator'),
  ('in_progress', 'resolved',    'committee'),
  ('in_progress', 'closed',      'moderator'),
  ('in_progress', 'closed',      'committee')
) AS t (from_slug, to_slug, role_name)
JOIN s AS s_from ON s_from.slug = t.from_slug
JOIN s AS s_to   ON s_to.slug   = t.to_slug
JOIN r           ON r.name      = t.role_name;

-- Add node_id to github_links for bidirectional webhook matching.
-- Nullable: rows created before this migration will not have a node_id.
ALTER TABLE github_links ADD COLUMN node_id TEXT;
CREATE INDEX idx_github_links_node_id ON github_links (node_id) WHERE node_id IS NOT NULL;

-- System user used as changed_by for GitHub-bot-triggered transitions.
-- Fixed UUID so services can reference it without a DB lookup.
INSERT INTO users (id, hanablive_username, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', '__github_bot__', 'GitHub Bot');

-- Down Migration

DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001';

DROP INDEX idx_github_links_node_id;
ALTER TABLE github_links DROP COLUMN node_id;

WITH
  s AS (SELECT id, slug FROM statuses),
  r AS (SELECT id, name FROM roles)
DELETE FROM valid_transitions
WHERE (from_status_id, to_status_id, role_id) IN (
  SELECT s_from.id, s_to.id, r.id
  FROM (VALUES
    ('decided',     'in_progress', 'moderator'),
    ('decided',     'in_progress', 'committee'),
    ('in_progress', 'resolved',    'moderator'),
    ('in_progress', 'resolved',    'committee'),
    ('in_progress', 'closed',      'moderator'),
    ('in_progress', 'closed',      'committee')
  ) AS t (from_slug, to_slug, role_name)
  JOIN s AS s_from ON s_from.slug = t.from_slug
  JOIN s AS s_to   ON s_to.slug   = t.to_slug
  JOIN r           ON r.name      = t.role_name
);

DELETE FROM statuses WHERE slug = 'in_progress';
