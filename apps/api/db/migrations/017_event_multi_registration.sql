ALTER TABLE events
  ADD COLUMN multi_registration TEXT NOT NULL DEFAULT 'ONE_PER_SIZE'
    CHECK (multi_registration IN ('ONE', 'ONE_PER_SIZE', 'UNRESTRICTED'));
