-- Event names do not need to be unique; slug is the canonical identifier.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_name_key;
