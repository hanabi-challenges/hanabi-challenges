-- Add confirmed column to event_team_members to support team invitation/confirmation flow.
-- Default FALSE so existing rows are treated as unconfirmed (safe for data that predates this).

ALTER TABLE event_team_members
  ADD COLUMN confirmed BOOLEAN NOT NULL DEFAULT FALSE;
