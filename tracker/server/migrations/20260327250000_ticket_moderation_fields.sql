-- Up Migration

-- Flag for committee review (set by moderator/committee)
ALTER TABLE tickets ADD COLUMN ready_for_review_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN flagged_by UUID REFERENCES users (id);

-- Duplicate ticket reference (set when a ticket is closed as a duplicate)
ALTER TABLE tickets ADD COLUMN duplicate_of UUID REFERENCES tickets (id);

-- Down Migration

ALTER TABLE tickets DROP COLUMN duplicate_of;
ALTER TABLE tickets DROP COLUMN flagged_by;
ALTER TABLE tickets DROP COLUMN ready_for_review_at;
