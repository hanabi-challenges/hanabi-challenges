-- Up Migration

-- Adds an editable description template to each ticket type.
-- Committee members update these via the admin UI.
ALTER TABLE ticket_types
  ADD COLUMN template_body      TEXT,
  ADD COLUMN template_updated_at TIMESTAMPTZ,
  ADD COLUMN template_updated_by UUID REFERENCES users (id);

-- Seed default templates
UPDATE ticket_types SET template_body = '## What happened?
<!-- Describe the bug clearly. What did you expect to happen? What actually happened? -->

## Steps to reproduce
1.
2.
3.

## Additional context
<!-- Anything else that might help: screenshots, game ID, etc. -->'
WHERE slug = 'bug';

UPDATE ticket_types SET template_body = '## Summary
<!-- What would you like to see added or changed? -->

## Why
<!-- What problem does this solve? Who benefits? -->

## Additional context
<!-- Any examples, references, or related tickets? -->'
WHERE slug = 'feature_request';

UPDATE ticket_types SET template_body = '## Feedback
<!-- Share your thoughts, suggestions, or general impressions. -->'
WHERE slug = 'feedback';

-- Down Migration

ALTER TABLE ticket_types
  DROP COLUMN template_updated_by,
  DROP COLUMN template_updated_at,
  DROP COLUMN template_body;
