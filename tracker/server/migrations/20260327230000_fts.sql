-- Up Migration

-- Add a generated tsvector column that concatenates title and description.
-- The column is maintained automatically by PostgreSQL; no trigger needed.
-- Queries use: WHERE search_vector @@ plainto_tsquery('english', ?)
ALTER TABLE tickets
  ADD COLUMN search_vector TSVECTOR
  GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || description)) STORED;

CREATE INDEX idx_tickets_fts ON tickets USING GIN (search_vector);

-- Down Migration

DROP INDEX idx_tickets_fts;
ALTER TABLE tickets DROP COLUMN search_vector;
