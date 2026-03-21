-- event_matches.team1_id / team2_id / winner_team_id reference event_teams
-- without ON DELETE CASCADE, so deleting an event with match-play data fails
-- because PostgreSQL tries to cascade-delete event_teams before the matches
-- referencing them are gone.  Add CASCADE to all three FKs.

ALTER TABLE event_matches
  DROP CONSTRAINT event_matches_team1_id_fkey,
  ADD  CONSTRAINT event_matches_team1_id_fkey
       FOREIGN KEY (team1_id) REFERENCES event_teams(id) ON DELETE CASCADE;

ALTER TABLE event_matches
  DROP CONSTRAINT event_matches_team2_id_fkey,
  ADD  CONSTRAINT event_matches_team2_id_fkey
       FOREIGN KEY (team2_id) REFERENCES event_teams(id) ON DELETE CASCADE;

ALTER TABLE event_matches
  DROP CONSTRAINT event_matches_winner_team_id_fkey,
  ADD  CONSTRAINT event_matches_winner_team_id_fkey
       FOREIGN KEY (winner_team_id) REFERENCES event_teams(id) ON DELETE SET NULL;
