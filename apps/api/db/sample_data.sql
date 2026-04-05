BEGIN;

-- Wipe existing data (and reset sequences)
TRUNCATE TABLE
  event_award_grants,
  event_awards,
  event_match_play_entries,
  event_match_game_results,
  event_matches,
  event_game_result_participants,
  event_game_results,
  event_gauntlet_attempts,
  event_badge_awards,
  event_team_members,
  event_teams,
  event_stage_opt_ins,
  event_registrations,
  event_stage_games,
  event_stage_transitions,
  event_player_ratings,
  event_stage_groups,
  event_stages,
  event_badge_set_links,
  event_challenge_badge_config,
  event_badges,
  event_admins,
  events,
  users
RESTART IDENTITY CASCADE;

------------------------------------------------------------
-- USERS
-- Passwords are all "password" (bcrypt, cost 12)
------------------------------------------------------------
INSERT INTO users (display_name, password_hash, roles, color_hex, text_color)
VALUES
  ('alice',   '$2b$12$qgQ62eU7pi8lzSHJkZgFGOXfArenCOPHJS.peakPCiAmgSCkBESUu', ARRAY['USER', 'SUPERADMIN']::TEXT[],             '#7aa6ff', '#000000'),
  ('bob',     '$2b$12$qgQ62eU7pi8lzSHJkZgFGOXfArenCOPHJS.peakPCiAmgSCkBESUu', ARRAY['USER', 'HOST', 'SITE_ADMIN']::TEXT[],     '#f6a5c0', '#000000'),
  ('cathy',   '$2b$12$qgQ62eU7pi8lzSHJkZgFGOXfArenCOPHJS.peakPCiAmgSCkBESUu', ARRAY['USER']::TEXT[],                           '#5fd0b8', '#000000'),
  ('donald',  '$2b$12$qgQ62eU7pi8lzSHJkZgFGOXfArenCOPHJS.peakPCiAmgSCkBESUu', ARRAY['USER']::TEXT[],                           '#ffcc80', '#000000');

-- user ids: 1=alice  2=bob  3=cathy  4=donald

------------------------------------------------------------
-- EVENT 1: No Variant Challenge 2025
-- Simple single-stage SEEDED_LEADERBOARD, two 2p teams, complete results.
-- Exercises: registration, team creation, game results, leaderboard queries.
------------------------------------------------------------
INSERT INTO events (
  slug, name, short_description, long_description,
  published, registration_mode, allowed_team_sizes,
  combined_leaderboard, registration_opens_at, registration_cutoff,
  allow_late_registration
)
VALUES (
  'no-variant-challenge-2025',
  'No Variant Challenge 2025',
  '5 seeds, No Variant, all team sizes welcome.',
  $$A classic 5-seed No Variant challenge. All teams play the same fixed seeds and scores are compared across the field. Finish all 5 games before the deadline to earn a completion badge.$$,
  TRUE,
  'ACTIVE',
  '{2}',
  FALSE,
  '2026-01-01T00:00:00Z',
  '2026-01-14T00:00:00Z',
  FALSE
);

-- event ids: 1=No Variant Challenge 2025

INSERT INTO event_admins (event_id, user_id, role)
VALUES (1, 1, 'OWNER');  -- alice

------------------------------------------------------------
-- EVENT 2: Boom & Bloom Spring Open
-- Multi-stage: 2 challenge weeks → playoff bracket.
-- Exercises: stage relationships, stage-scoped teams.
------------------------------------------------------------
INSERT INTO events (
  slug, name, short_description, long_description,
  published, registration_mode, allowed_team_sizes,
  combined_leaderboard, aggregate_config_json,
  registration_opens_at, registration_cutoff,
  allow_late_registration
)
VALUES (
  'boom-and-bloom-spring-open',
  'Boom & Bloom Spring Open',
  '2-week challenge series followed by a playoff bracket.',
  $$Eight weeks of async 2p challenges followed by a single-elimination playoff. Teams form fresh each week; your cumulative score across all weeks seeds you into the bracket.$$,
  TRUE,
  'ACTIVE',
  '{2}',
  FALSE,
  '{"method": "sum"}'::jsonb,
  '2026-02-01T00:00:00Z',
  '2026-02-07T00:00:00Z',
  FALSE
);

-- event ids: 2=Boom & Bloom Spring Open

INSERT INTO event_admins (event_id, user_id, role)
VALUES (2, 1, 'OWNER');  -- alice

------------------------------------------------------------
-- STAGES
------------------------------------------------------------

-- Event 1: single challenge stage (INDIVIDUAL: players opt in and are paired)
INSERT INTO event_stages (
  event_id, label, stage_index,
  mechanism, participation_type, team_scope, attempt_policy, time_policy,
  game_scoring_config_json, stage_scoring_config_json,
  starts_at, ends_at
)
VALUES (
  1, 'Challenge', 1,
  'SEEDED_LEADERBOARD', 'INDIVIDUAL', 'EVENT', 'REQUIRED_ALL', 'WINDOW',
  '{"primary": "score", "tiebreakers": ["bdr_desc"]}'::jsonb,
  '{"method": "sum"}'::jsonb,
  '2026-01-15T00:00:00Z',
  '2026-02-15T00:00:00Z'
);

-- Event 2 stage 1: challenge week
INSERT INTO event_stages (
  event_id, label, stage_index,
  mechanism, participation_type, team_scope, attempt_policy, time_policy,
  game_scoring_config_json, stage_scoring_config_json,
  starts_at, ends_at
)
VALUES (
  2, 'Week 1', 1,
  'SEEDED_LEADERBOARD', 'TEAM', 'STAGE', 'REQUIRED_ALL', 'WINDOW',
  '{"primary": "score", "tiebreakers": ["bdr_desc"]}'::jsonb,
  '{"method": "sum"}'::jsonb,
  '2026-02-08T00:00:00Z',
  '2026-02-22T00:00:00Z'
);

-- Event 2 stage 2: playoffs (bracket)
INSERT INTO event_stages (
  event_id, label, stage_index,
  mechanism, participation_type, team_scope, attempt_policy, time_policy,
  stage_scoring_config_json,
  config_json,
  starts_at, ends_at
)
VALUES (
  2, 'Playoffs', 2,
  'MATCH_PLAY', 'TEAM', 'EVENT', 'SINGLE', 'WINDOW',
  '{"method": "win_loss"}'::jsonb,
  '{"bracket_type": "SINGLE_ELIMINATION", "match_format": "best_of_1"}'::jsonb,
  '2026-03-01T00:00:00Z',
  '2026-03-15T00:00:00Z'
);

-- stage ids: 1=NV Challenge (event 1)  2=B&B Week 1 (event 2)  3=B&B Playoffs (event 2)

-- Stage group: "Qualifying" for event 2 (aggregates weekly stages into one leaderboard)
INSERT INTO event_stage_groups (event_id, label, group_index, scoring_config_json)
VALUES (2, 'Qualifying', 0, '{"method": "sum", "absent_score_policy": "null_as_zero"}'::jsonb);

-- group ids: 1=Qualifying (event 2)

-- Assign Week 1 to the Qualifying group
UPDATE event_stages SET group_id = 1 WHERE id = 2;

-- Transition: after Qualifying group → Playoffs, top 2 ranked
INSERT INTO event_stage_transitions (
  event_id, after_group_id,
  filter_type, filter_value, seeding_method
)
VALUES (2, 1, 'TOP_N', 2, 'RANKED');

------------------------------------------------------------
-- GAME SLOTS
------------------------------------------------------------

-- Event 1 stage (5 seeds, No Variant)
INSERT INTO event_stage_games (stage_id, game_index, variant_id, seed_payload, max_score)
VALUES
  (1, 1, 0, 'NVC25-1-1', 25),
  (1, 2, 0, 'NVC25-1-2', 25),
  (1, 3, 0, 'NVC25-1-3', 25),
  (1, 4, 0, 'NVC25-1-4', 25),
  (1, 5, 0, 'NVC25-1-5', 25);

-- Event 2 Week 1 (2 seeds shown; enough to exercise results)
INSERT INTO event_stage_games (stage_id, game_index, variant_id, seed_payload, max_score)
VALUES
  (2, 1, 0, 'BB26-W1-1', 25),
  (2, 2, 0, 'BB26-W1-2', 25);

-- stage_game ids:
-- 1..5  -> Event 1 Challenge games (index 1..5)
-- 6..7  -> Event 2 Week 1 games (index 1..2)

------------------------------------------------------------
-- REGISTRATIONS
------------------------------------------------------------

-- Event 1: all four users
INSERT INTO event_registrations (event_id, user_id, status)
VALUES
  (1, 1, 'ACTIVE'),  -- alice
  (1, 2, 'ACTIVE'),  -- bob
  (1, 3, 'ACTIVE'),  -- cathy
  (1, 4, 'ACTIVE');  -- donald

-- Event 2: all four users
INSERT INTO event_registrations (event_id, user_id, status)
VALUES
  (2, 1, 'ACTIVE'),  -- alice
  (2, 2, 'ACTIVE'),  -- bob
  (2, 3, 'ACTIVE'),  -- cathy
  (2, 4, 'ACTIVE');  -- donald

------------------------------------------------------------
-- TEAMS
------------------------------------------------------------

-- Event 1 teams (EVENT scope → stage_id NULL)
INSERT INTO event_teams (event_id, stage_id, team_size, source)
VALUES
  (1, NULL, 2, 'REGISTERED'),  -- team 1: alice + bob
  (1, NULL, 2, 'REGISTERED');  -- team 2: cathy + donald

-- Event 2 Week 1 teams (STAGE scope → stage_id = 2)
INSERT INTO event_teams (event_id, stage_id, team_size, source)
VALUES
  (2, 2, 2, 'REGISTERED'),  -- team 3: alice + bob
  (2, 2, 2, 'REGISTERED');  -- team 4: cathy + donald

-- team ids: 1=alice+bob (event 1)  2=cathy+donald (event 1)
--           3=alice+bob (event 2 w1)  4=cathy+donald (event 2 w1)

INSERT INTO event_team_members (event_team_id, user_id, confirmed)
VALUES
  (1, 1, TRUE), (1, 2, TRUE),   -- alice, bob
  (2, 3, TRUE), (2, 4, TRUE),   -- cathy, donald
  (3, 1, TRUE), (3, 2, TRUE),   -- alice, bob
  (4, 3, TRUE), (4, 4, TRUE);   -- cathy, donald

------------------------------------------------------------
-- GAME RESULTS (Event 1 — all 5 seeds, both teams)
------------------------------------------------------------

-- Team 1 (alice+bob): complete run
INSERT INTO event_game_results (
  event_team_id, stage_game_id, score, bottom_deck_risk, hanabi_live_game_id, played_at
)
VALUES
  (1, 1, 25, 1, 1001001, '2026-01-20T19:00:00Z'),
  (1, 2, 24, 3, 1001002, '2026-01-22T19:00:00Z'),
  (1, 3, 25, 0, 1001003, '2026-01-25T19:00:00Z'),
  (1, 4, 23, 4, 1001004, '2026-01-27T19:00:00Z'),
  (1, 5, 22, 5, 1001005, '2026-02-01T19:00:00Z');

-- Team 2 (cathy+donald): complete run
INSERT INTO event_game_results (
  event_team_id, stage_game_id, score, bottom_deck_risk, hanabi_live_game_id, played_at
)
VALUES
  (2, 1, 24, 2, 1002001, '2026-01-21T20:00:00Z'),
  (2, 2, 25, 0, 1002002, '2026-01-23T20:00:00Z'),
  (2, 3, 23, 5, 1002003, '2026-01-26T20:00:00Z'),
  (2, 4, 24, 3, 1002004, '2026-01-28T20:00:00Z'),
  (2, 5,  0, 8, 1002005, '2026-02-02T20:00:00Z');  -- zero: strike out

UPDATE event_game_results
SET zero_reason = 'Strike Out'
WHERE event_team_id = 2 AND stage_game_id = 5;

-- game_result ids:
-- 1..5  -> team 1 (alice+bob), games 1..5
-- 6..10 -> team 2 (cathy+donald), games 1..5

-- Participants for Event 1 results
INSERT INTO event_game_result_participants (game_result_id, user_id)
VALUES
  (1, 1), (1, 2),
  (2, 1), (2, 2),
  (3, 1), (3, 2),
  (4, 1), (4, 2),
  (5, 1), (5, 2),
  (6, 3), (6, 4),
  (7, 3), (7, 4),
  (8, 3), (8, 4),
  (9, 3), (9, 4),
  (10, 3), (10, 4);

------------------------------------------------------------
-- GAME RESULTS (Event 2 Week 1 — 2 seeds, both teams)
------------------------------------------------------------

-- Team 3 (alice+bob, Week 1)
INSERT INTO event_game_results (
  event_team_id, stage_game_id, score, bottom_deck_risk, hanabi_live_game_id, played_at
)
VALUES
  (3, 6, 24, 2, 2001001, '2026-02-10T19:00:00Z'),
  (3, 7, 23, 3, 2001002, '2026-02-12T19:00:00Z');

-- Team 4 (cathy+donald, Week 1)
INSERT INTO event_game_results (
  event_team_id, stage_game_id, score, bottom_deck_risk, hanabi_live_game_id, played_at
)
VALUES
  (4, 6, 22, 4, 2002001, '2026-02-11T20:00:00Z'),
  (4, 7, 21, 5, 2002002, '2026-02-13T20:00:00Z');

-- game_result ids: 11..12 -> team 3, 13..14 -> team 4

-- Participants for Event 2 Week 1 results
INSERT INTO event_game_result_participants (game_result_id, user_id)
VALUES
  (11, 1), (11, 2),
  (12, 1), (12, 2),
  (13, 3), (13, 4),
  (14, 3), (14, 4);

------------------------------------------------------------
-- EVENT BADGES (Event 1 — 2p podium + completion)
------------------------------------------------------------

INSERT INTO event_badges (event_id, name, description, icon, rank, team_size)
VALUES
  (1, 'No Variant Challenge 2025 — 1st',        '1st place 2p team.',             'f612', '1',          2),
  (1, 'No Variant Challenge 2025 — 2nd',        '2nd place 2p team.',             'f612', '2',          2),
  (1, 'No Variant Challenge 2025 — 3rd',        '3rd place 2p team.',             'f612', '3',          2),
  (1, 'No Variant Challenge 2025 — Completion', 'Completed all 5 seeds (2p).',    'f612', 'completion', 2);

-- badge ids: 1=1st  2=2nd  3=3rd  4=completion

-- Team 1 (alice+bob) placed 1st and earned completion
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (1, 1, 1),  -- 1st: alice
  (1, 1, 2),  -- 1st: bob
  (4, 1, 1),  -- completion: alice
  (4, 1, 2);  -- completion: bob

-- Team 2 (cathy+donald) placed 2nd; did not complete (zero on game 5)
INSERT INTO event_badge_awards (event_badge_id, team_id, user_id)
VALUES
  (2, 2, 3),  -- 2nd: cathy
  (2, 2, 4);  -- 2nd: donald

COMMIT;
