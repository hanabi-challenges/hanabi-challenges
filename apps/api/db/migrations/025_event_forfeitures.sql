-- Players who explicitly forfeit eligibility to view spoilers.
-- Not tied to registration — a non-enrolled player can also forfeit.

CREATE TABLE IF NOT EXISTS event_forfeitures (
  event_id     INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  forfeited_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (event_id, user_id)
);
